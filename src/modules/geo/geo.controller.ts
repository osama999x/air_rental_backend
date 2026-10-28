import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { GeoService } from './geo.service';

@ApiTags('Reference data')
@Controller()
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Public()
  @Get('countries')
  @ApiQuery({ name: 'search', required: false })
  async countries(@Query('search') search?: string) {
    return new ResponseDto('Countries', await this.geo.searchCountries(search));
  }

  @Public()
  @Get('countries/:countryId/cities')
  @ApiQuery({ name: 'search', required: false })
  async cities(@Param('countryId') countryId: string, @Query('search') search?: string) {
    return new ResponseDto('Cities', await this.geo.searchCities(countryId, search));
  }

  @Public()
  @Get('languages')
  async languages() {
    return new ResponseDto('Languages', await this.geo.languagesList());
  }

  @ApiBearerAuth()
  @Get('currencies')
  async currencies() {
    return new ResponseDto('Currencies', await this.geo.currenciesList());
  }

  @ApiBearerAuth()
  @Get('measurement-units')
  async units() {
    return new ResponseDto('Measurement units', await this.geo.unitsList());
  }
}
