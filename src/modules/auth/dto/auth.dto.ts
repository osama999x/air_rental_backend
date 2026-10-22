import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import { PortalRole } from '../../../common/enums';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(10)
  password: string;

  @IsString()
  @Length(1, 120)
  firstName: string;

  @IsString()
  @Length(1, 120)
  lastName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  preferredLanguage?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  pushToken?: string;
}

export class VerifyEmailDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  code: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}

export class EmailDto {
  @IsEmail()
  email: string;
}

export class PhoneDto {
  @IsString()
  @Length(8, 32)
  phone: string;
}

export class VerifyPhoneDto {
  @IsString()
  @Length(8, 32)
  phone: string;

  @IsString()
  @Length(6, 6)
  code: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  @MinLength(10)
  password: string;
}

export class IdentityTokenDto {
  @IsString()
  idToken: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;
}

export class ActiveRoleDto {
  @IsIn([PortalRole.OWNER, PortalRole.TENANT, PortalRole.MANAGER])
  role: PortalRole;
}

export class BiometricKeyDto {
  @IsString()
  publicKey: string;
}

export class BiometricVerifyDto {
  @IsString()
  deviceSessionId: string;

  @IsString()
  signature: string;
}

export class RoleGrantDto {
  @IsIn([PortalRole.OWNER, PortalRole.TENANT, PortalRole.MANAGER])
  role: PortalRole;
}
