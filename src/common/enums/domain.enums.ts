export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DEACTIVATED = 'DEACTIVATED',
  PENDING_DELETION = 'PENDING_DELETION',
}

export enum AuthProvider {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
  APPLE = 'APPLE',
}

export enum TokenAudience {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export enum OtpChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
}

export enum OtpPurpose {
  VERIFY_EMAIL = 'VERIFY_EMAIL',
  RESET_PASSWORD = 'RESET_PASSWORD',
  VERIFY_PHONE = 'VERIFY_PHONE',
  MFA = 'MFA',
}

export enum PortalRole {
  OWNER = 'OWNER',
  TENANT = 'TENANT',
  MANAGER = 'MANAGER',
}

export enum AccountCategory {
  INDIVIDUAL = 'INDIVIDUAL',
  BUSINESS = 'BUSINESS',
}

export enum OrganizationMemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  BILLING = 'BILLING',
}

export enum MembershipStatus {
  ACTIVE = 'ACTIVE',
  INVITED = 'INVITED',
  REMOVED = 'REMOVED',
}

export enum PropertyType {
  HSE = 'HSE',
  APT = 'APT',
  SHP = 'SHP',
  FLR = 'FLR',
  ROM = 'ROM',
  OFC = 'OFC',
  WRH = 'WRH',
  PLT = 'PLT',
}

export enum PropertyStatus {
  VACANT = 'VACANT',
  RENTED = 'RENTED',
}

export enum MediaKind {
  PHOTO = 'PHOTO',
  DOCUMENT = 'DOCUMENT',
}

export enum TenancyStatus {
  PROPOSED = 'PROPOSED',
  INVITED = 'INVITED',
  ACCEPTED = 'ACCEPTED',
  ACTIVE = 'ACTIVE',
  TERMINATED = 'TERMINATED',
  COMPLETED = 'COMPLETED',
  DECLINED = 'DECLINED',
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

export enum ParticipantSide {
  OWNER = 'OWNER',
  TENANT = 'TENANT',
  MANAGER = 'MANAGER',
}

export enum AssignmentSide {
  OWNER = 'OWNER',
  TENANT = 'TENANT',
}

export enum AssignmentStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
}

export enum AgreementStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  SUPERSEDED = 'SUPERSEDED',
  TERMINATED = 'TERMINATED',
}

export enum RenewalStatus {
  PROPOSED = 'PROPOSED',
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
}

export enum RentStatus {
  UPCOMING = 'UPCOMING',
  DUE = 'DUE',
  PARTIAL = 'PARTIAL',
  PROOF_SUBMITTED = 'PROOF_SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
}

export enum LedgerStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
}

export enum ProofStatus {
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum BillCategory {
  ELECTRICITY = 'ELECTRICITY',
  GAS = 'GAS',
  WATER = 'WATER',
  INTERNET = 'INTERNET',
  MAINTENANCE = 'MAINTENANCE',
  TAX = 'TAX',
  CHALLAN = 'CHALLAN',
  OTHER = 'OTHER',
}

export enum ResponsibilityMode {
  OWNER = 'OWNER',
  TENANT = 'TENANT',
  MANAGER = 'MANAGER',
  SHARED = 'SHARED',
}

export enum BillStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export enum PaymentPurpose {
  BILL = 'BILL',
  SUBSCRIPTION = 'SUBSCRIPTION',
}

export enum PaymentIntentStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum SubscriptionStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  PAID = 'PAID',
  VOID = 'VOID',
  UNCOLLECTIBLE = 'UNCOLLECTIBLE',
}

export enum MaintenanceStatus {
  NEW = 'NEW',
  APPROVED = 'APPROVED',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum InspectionStatus {
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum HandoverType {
  MOVE_IN = 'MOVE_IN',
  MOVE_OUT = 'MOVE_OUT',
}

export enum HandoverStatus {
  DRAFT = 'DRAFT',
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  CONFIRMED = 'CONFIRMED',
}

export enum SettlementStatus {
  OPEN = 'OPEN',
  APPROVED = 'APPROVED',
  REFUNDED = 'REFUNDED',
  CLOSED = 'CLOSED',
}

export enum DocumentOwnerType {
  PROPERTY = 'PROPERTY',
  TENANCY = 'TENANCY',
  USER = 'USER',
}

export enum VerificationStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export enum InsuranceHolder {
  OWNER = 'OWNER',
  TENANT = 'TENANT',
}

export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  DEAD = 'DEAD',
}

export enum AdminStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum SupportStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum IntegrationCapability {
  MANUAL = 'MANUAL',
  API = 'API',
  UNAVAILABLE = 'UNAVAILABLE',
}
