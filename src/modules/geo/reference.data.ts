export const LANGUAGES: Array<[string, string, string]> = [
  ['en', 'English', 'English'],
  ['zh', 'Chinese (Mandarin)', '中文'],
  ['hi', 'Hindi', 'हिन्दी'],
  ['es', 'Spanish', 'Español'],
  ['ar', 'Arabic', 'العربية'],
  ['fr', 'French', 'Français'],
  ['bn', 'Bengali', 'বাংলা'],
  ['pt', 'Portuguese', 'Português'],
  ['ru', 'Russian', 'Русский'],
  ['ur', 'Urdu', 'اردو'],
  ['ur-Latn', 'Roman Urdu', 'Roman Urdu'],
];

export const CURRENCIES: Array<[string, string, number]> = [
  ['USD', 'US Dollar', 2],
  ['EUR', 'Euro', 2],
  ['GBP', 'British Pound', 2],
  ['PKR', 'Pakistani Rupee', 2],
  ['AED', 'UAE Dirham', 2],
  ['SAR', 'Saudi Riyal', 2],
  ['INR', 'Indian Rupee', 2],
  ['CNY', 'Chinese Yuan', 2],
  ['JPY', 'Japanese Yen', 0],
  ['CAD', 'Canadian Dollar', 2],
  ['AUD', 'Australian Dollar', 2],
];

export const COUNTRIES: Array<[string, string, string, string, string, string]> = [
  ['PK', 'PAK', 'Pakistan', '+92', 'PKR', 'Asia/Karachi'],
  ['US', 'USA', 'United States', '+1', 'USD', 'America/New_York'],
  ['GB', 'GBR', 'United Kingdom', '+44', 'GBP', 'Europe/London'],
  ['AE', 'ARE', 'United Arab Emirates', '+971', 'AED', 'Asia/Dubai'],
  ['SA', 'SAU', 'Saudi Arabia', '+966', 'SAR', 'Asia/Riyadh'],
  ['IN', 'IND', 'India', '+91', 'INR', 'Asia/Kolkata'],
  ['CN', 'CHN', 'China', '+86', 'CNY', 'Asia/Shanghai'],
  ['CA', 'CAN', 'Canada', '+1', 'CAD', 'America/Toronto'],
  ['AU', 'AUS', 'Australia', '+61', 'AUD', 'Australia/Sydney'],
  ['DE', 'DEU', 'Germany', '+49', 'EUR', 'Europe/Berlin'],
  ['FR', 'FRA', 'France', '+33', 'EUR', 'Europe/Paris'],
  ['ES', 'ESP', 'Spain', '+34', 'EUR', 'Europe/Madrid'],
  ['QA', 'QAT', 'Qatar', '+974', 'USD', 'Asia/Qatar'],
  ['BH', 'BHR', 'Bahrain', '+973', 'USD', 'Asia/Bahrain'],
  ['OM', 'OMN', 'Oman', '+968', 'USD', 'Asia/Muscat'],
];

export const CITIES: Record<string, Array<[string, string]>> = {
  PK: [
    ['Karachi', 'Sindh'],
    ['Hyderabad', 'Sindh'],
    ['Lahore', 'Punjab'],
    ['Islamabad', 'Islamabad'],
    ['Rawalpindi', 'Punjab'],
    ['Faisalabad', 'Punjab'],
    ['Multan', 'Punjab'],
    ['Peshawar', 'Khyber Pakhtunkhwa'],
    ['Quetta', 'Balochistan'],
  ],
  US: [['New York', 'New York'], ['Austin', 'Texas']],
  GB: [['London', 'England'], ['Manchester', 'England']],
  AE: [['Dubai', 'Dubai'], ['Abu Dhabi', 'Abu Dhabi']],
  SA: [['Riyadh', 'Riyadh'], ['Jeddah', 'Makkah']],
  IN: [['Mumbai', 'Maharashtra'], ['Delhi', 'Delhi']],
};

export const UNITS: Array<[string, string, string]> = [
  ['sqft', 'Square feet', 'imperial'],
  ['sqm', 'Square metres', 'metric'],
  ['marla', 'Marla', 'local'],
  ['kanal', 'Kanal', 'local'],
  ['acre', 'Acre', 'imperial'],
];

export const UTILITY_PROVIDERS: Array<[string, string, string, string]> = [
  ['SNGPL', 'Sui Northern Gas Pipelines', 'PK', 'GAS'],
  ['SSGC', 'Sui Southern Gas Company', 'PK', 'GAS'],
  ['IESCO', 'Islamabad Electric Supply Company', 'PK', 'ELECTRICITY'],
  ['LESCO', 'Lahore Electric Supply Company', 'PK', 'ELECTRICITY'],
  ['K-ELECTRIC', 'K-Electric', 'PK', 'ELECTRICITY'],
  ['MEPCO', 'Multan Electric Power Company', 'PK', 'ELECTRICITY'],
  ['FESCO', 'Faisalabad Electric Supply Company', 'PK', 'ELECTRICITY'],
  ['GEPCO', 'Gujranwala Electric Power Company', 'PK', 'ELECTRICITY'],
  ['PESCO', 'Peshawar Electric Supply Company', 'PK', 'ELECTRICITY'],
  ['HESCO', 'Hyderabad Electric Supply Company', 'PK', 'ELECTRICITY'],
  ['SEPCO', 'Sukkur Electric Power Company', 'PK', 'ELECTRICITY'],
  ['WASA-LHR', 'WASA Lahore', 'PK', 'WATER'],
  ['KWSC', 'Karachi Water and Sewerage Corporation', 'PK', 'WATER'],
];
