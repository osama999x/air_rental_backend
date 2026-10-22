import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InvoiceStatus, SubscriptionStatus, TenancyStatus } from '../../common/enums';
import { addDays } from '../../common/utils/dates.util';
import { zeroAmount } from '../../common/utils/money.util';
import {
  Organization,
  Property,
  Subscription,
  SubscriptionInvoice,
  SubscriptionPlan,
  Tenancy,
} from '../../database/entities';
import { quoteSubscription } from './subscription.rules';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription) private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(SubscriptionPlan) private readonly plans: Repository<SubscriptionPlan>,
    @InjectRepository(SubscriptionInvoice) private readonly invoices: Repository<SubscriptionInvoice>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(Tenancy) private readonly tenancies: Repository<Tenancy>,
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
  ) {}

  async current(userId: string) {
    const subscription = await this.ensure(userId);
    const quote = await this.recalculate(userId);
    return { subscription: await this.subscriptions.findOne({ where: { id: subscription.id } }), quote };
  }

  async countActiveUnits(accountUserId: string): Promise<number> {
    const orgs = await this.organizations.find({ where: { createdByUserId: accountUserId } });
    const orgIds = orgs.map((org) => org.id);
    const owned = await this.properties.find({ where: { ownerUserId: accountUserId } });
    const orgProperties = orgIds.length
      ? await this.properties.find({ where: { organizationId: In(orgIds) } })
      : [];
    const propertyIds = [...new Set([...owned, ...orgProperties].filter((property) => !property.archivedAt).map((property) => property.id))];
    if (!propertyIds.length) return 0;
    const active = await this.tenancies.find({
      where: { propertyId: In(propertyIds), status: TenancyStatus.ACTIVE },
    });
    return new Set(active.map((tenancy) => tenancy.propertyId)).size;
  }

  async recalculate(accountUserId: string) {
    const subscription = await this.ensure(accountUserId);
    const tiers = (await this.plans.find()).map((plan) => ({
      code: plan.code,
      minUnits: plan.minUnits,
      maxUnits: plan.maxUnits ?? null,
      pricePerUnit: plan.pricePerUnit,
    }));
    const activeUnits = await this.countActiveUnits(accountUserId);
    const inTrialWindow = Boolean(subscription.trialEndsAt && subscription.trialEndsAt > new Date());
    const quote = quoteSubscription({
      activeUnits,
      tiers: tiers.length ? tiers : undefined,
      trialAvailable: !subscription.trialUsed || inTrialWindow,
      trialUnits: 1,
    });
    const now = new Date();
    if (!subscription.trialUsed && activeUnits > 0) {
      subscription.trialUsed = true;
      subscription.trialStartedAt = now;
      subscription.trialEndsAt = addDays(now, 30);
      subscription.status = SubscriptionStatus.TRIALING;
    } else if (subscription.trialEndsAt && subscription.trialEndsAt > now) {
      subscription.status = SubscriptionStatus.TRIALING;
    } else if (activeUnits > 0) {
      subscription.status = SubscriptionStatus.ACTIVE;
    }
    subscription.planCode = quote.planCode;
    subscription.activeUnitCount = activeUnits;
    subscription.currentPeriodStart = subscription.currentPeriodStart || now;
    subscription.currentPeriodEnd = addDays(subscription.currentPeriodStart, 30);
    await this.subscriptions.save(subscription);
    return quote;
  }

  async openInvoice(accountUserId: string) {
    const subscription = await this.ensure(accountUserId);
    const quote = await this.recalculate(accountUserId);
    if (!quote.planCode) throw new NotFoundException('There are no billable units');
    const invoice = await this.invoices.save(this.invoices.create({
      subscriptionId: subscription.id,
      periodStart: subscription.currentPeriodStart || new Date(),
      periodEnd: subscription.currentPeriodEnd || addDays(new Date(), 30),
      unitCount: quote.activeUnits,
      billableUnits: quote.billableUnits,
      planCode: quote.planCode,
      pricePerUnit: quote.pricePerUnit,
      currencyCode: quote.currency,
      subtotal: quote.total,
      tax: zeroAmount(quote.currency),
      total: quote.total,
      status: InvoiceStatus.OPEN,
    }));
    return invoice;
  }

  async invoicesFor(userId: string) {
    const subscription = await this.subscriptions.findOne({ where: { accountUserId: userId } });
    if (!subscription) return [];
    return this.invoices.find({ where: { subscriptionId: subscription.id }, order: { createdAt: 'DESC' } });
  }

  private async ensure(accountUserId: string) {
    const existing = await this.subscriptions.findOne({ where: { accountUserId } });
    if (existing) return existing;
    return this.subscriptions.save(this.subscriptions.create({
      accountUserId,
      status: SubscriptionStatus.TRIALING,
      trialUsed: false,
      activeUnitCount: 0,
    }));
  }
}
