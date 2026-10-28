import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { City, Country, Currency, Language, MeasurementUnit, SubscriptionPlan, UtilityProvider } from '../../database/entities';
import { IntegrationCapability } from '../../common/enums';
import { RedisService } from '../redis/redis.service';
import { DEFAULT_TIERS } from '../subscriptions/subscription.rules';
import { CITIES, COUNTRIES, CURRENCIES, LANGUAGES, UNITS, UTILITY_PROVIDERS } from './reference.data';

@Injectable()
export class GeoService implements OnModuleInit {
  constructor(
    @InjectRepository(Country) private readonly countries: Repository<Country>,
    @InjectRepository(City) private readonly cities: Repository<City>,
    @InjectRepository(Language) private readonly languages: Repository<Language>,
    @InjectRepository(Currency) private readonly currencies: Repository<Currency>,
    @InjectRepository(MeasurementUnit) private readonly units: Repository<MeasurementUnit>,
    @InjectRepository(SubscriptionPlan) private readonly plans: Repository<SubscriptionPlan>,
    @InjectRepository(UtilityProvider) private readonly providers: Repository<UtilityProvider>,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    if (this.config.get<string>('SEED_ON_BOOT') === 'false') return;
    if (await this.countries.count()) return;
    await this.seedReference();
  }

  async seedReference() {
    for (const [code, name, minorUnits] of CURRENCIES) {
      await this.currencies.save(this.currencies.create({ code, name, minorUnits }));
    }
    for (const [code, name, nativeName] of LANGUAGES) {
      await this.languages.save(this.languages.create({ code, name, nativeName }));
    }
    for (const [code, name, system] of UNITS) {
      await this.units.save(this.units.create({ code, name, system }));
    }
    const countryIds = new Map<string, string>();
    for (const [iso2, iso3, name, phoneCode, defaultCurrencyCode, defaultTimezone] of COUNTRIES) {
      const saved = await this.countries.save(this.countries.create({
        iso2, iso3, name, phoneCode, defaultCurrencyCode, defaultTimezone,
      }));
      countryIds.set(iso2, saved.id);
    }
    for (const [iso2, rows] of Object.entries(CITIES)) {
      const countryId = countryIds.get(iso2);
      if (!countryId) continue;
      for (const [name, region] of rows) {
        await this.cities.save(this.cities.create({ countryId, name, region }));
      }
    }
    for (const tier of DEFAULT_TIERS) {
      await this.plans.save(this.plans.create({
        code: tier.code,
        name: tier.code[0] + tier.code.slice(1).toLowerCase(),
        minUnits: tier.minUnits,
        maxUnits: tier.maxUnits,
        pricePerUnit: tier.pricePerUnit,
        currencyCode: 'USD',
        trialDays: tier.code === 'STARTER' ? 30 : 0,
        trialUnits: tier.code === 'STARTER' ? 1 : 0,
      }));
    }
    for (const [code, name, countryIso2, category] of UTILITY_PROVIDERS) {
      await this.providers.save(this.providers.create({
        code,
        name,
        countryIso2,
        category,
        capability: IntegrationCapability.MANUAL,
        authRequirements: 'No official API credentials are configured. Use manual bill upload.',
        supportedOperations: ['MANUAL_UPLOAD'],
        retryPolicy: 'none',
        enabled: true,
      }));
    }
  }

  async searchCountries(search?: string) {
    const term = (search || '').trim().slice(0, 60).toLowerCase();
    return this.redis.remember(`geo:countries:${term}`, 600, () => this.countries.find({
      where: term ? { name: ILike(`%${term}%`) } : {},
      order: { name: 'ASC' },
      take: 50,
    }));
  }

  async searchCities(countryId: string, search?: string) {
    const term = (search || '').trim().slice(0, 60).toLowerCase();
    return this.redis.remember(`geo:cities:${countryId}:${term}`, 600, () => this.cities.find({
      where: term ? { countryId, name: ILike(`%${term}%`) } : { countryId },
      order: { name: 'ASC' },
      take: 100,
    }));
  }

  languagesList() {
    return this.redis.remember('geo:languages', 600, () => this.languages.find({ order: { name: 'ASC' } }));
  }

  currenciesList() {
    return this.redis.remember('geo:currencies', 600, () => this.currencies.find({ order: { code: 'ASC' } }));
  }

  unitsList() {
    return this.redis.remember('geo:units', 600, () => this.units.find({ order: { code: 'ASC' } }));
  }
}
