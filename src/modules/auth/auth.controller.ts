import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser, Public } from '../../common/decorators';
import { ResponseDto } from '../../common/dto/response';
import { User } from '../../database/entities';
import { AuthService } from './auth.service';
import {
  ActiveRoleDto,
  BiometricKeyDto,
  BiometricVerifyDto,
  EmailDto,
  IdentityTokenDto,
  PhoneDto,
  VerifyPhoneDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return new ResponseDto('Account created. Verify your email.', await this.auth.register(dto));
  }

  @Public()
  @Post('verify-email')
  async verify(@Body() dto: VerifyEmailDto, @Req() req: Request) {
    return new ResponseDto('Email verified', await this.auth.verifyEmail(dto.email, dto.code, this.meta(req)));
  }

  @Public()
  @Post('resend-verification')
  async resendVerification(@Body() dto: EmailDto) {
    return new ResponseDto(
      'If this email is waiting to be verified, a new code was sent.',
      await this.auth.resendVerification(dto.email),
    );
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return new ResponseDto('Signed in', await this.auth.login(dto.email, dto.password, { ...this.meta(req), ...dto }));
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return new ResponseDto('Token refreshed', await this.auth.refresh(dto.refreshToken, this.meta(req)));
  }

  @Public()
  @Post('forgot-password')
  async forgot(@Body() dto: EmailDto) {
    return new ResponseDto('If the account exists, a reset code was sent.', await this.auth.forgotPassword(dto.email));
  }

  @Public()
  @Post('reset-password')
  async reset(@Body() dto: ResetPasswordDto) {
    return new ResponseDto('Password updated', await this.auth.resetPassword(dto.email, dto.code, dto.password));
  }

  @Public()
  @Post('google')
  async google(@Body() dto: IdentityTokenDto, @Req() req: Request) {
    return new ResponseDto('Google sign-in completed', await this.auth.google(dto.idToken, this.meta(req), dto));
  }

  @Public()
  @Post('apple')
  async apple(@Body() dto: IdentityTokenDto, @Req() req: Request) {
    return new ResponseDto('Apple sign-in completed', await this.auth.apple(dto.idToken, this.meta(req), dto));
  }

  @ApiBearerAuth()
  @Post('phone/send')
  async sendPhone(@CurrentUser() user: User, @Body() dto: PhoneDto) {
    return new ResponseDto('Phone verification requested', await this.auth.sendPhoneCode(user, dto.phone));
  }

  @ApiBearerAuth()
  @Post('phone/verify')
  async verifyPhone(@CurrentUser() user: User, @Body() dto: VerifyPhoneDto) {
    return new ResponseDto('Phone verified', await this.auth.verifyPhoneCode(user, dto.phone, dto.code));
  }

  @ApiBearerAuth()
  @Post('logout')
  async logout(@CurrentUser() user: User, @Req() req: Request) {
    const payload = (req as Request & { tokenPayload?: { sid?: string } }).tokenPayload;
    return new ResponseDto('Signed out', await this.auth.logout(user.id, payload?.sid));
  }

  @ApiBearerAuth()
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: User) {
    return new ResponseDto('Signed out of all devices', await this.auth.logoutAll(user.id));
  }

  @ApiBearerAuth()
  @Get('sessions')
  async sessions(@CurrentUser() user: User) {
    return new ResponseDto('Sessions', await this.auth.sessions(user.id));
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  async revoke(@CurrentUser() user: User, @Param('id') id: string) {
    return new ResponseDto('Session revoked', await this.auth.revokeSession(user.id, id));
  }

  @ApiBearerAuth()
  @Get('roles')
  async roles(@CurrentUser() user: User) {
    return new ResponseDto('Roles', await this.auth.listRoles(user.id));
  }

  @ApiBearerAuth()
  @Post('active-role')
  async activeRole(@CurrentUser() user: User, @Body() dto: ActiveRoleDto) {
    return new ResponseDto('Active portal updated', await this.auth.setActiveRole(user, dto.role));
  }

  @Public()
  @Post('biometric/challenge')
  async challenge(@Body() dto: BiometricVerifyDto) {
    return new ResponseDto('Challenge issued', await this.auth.biometricChallenge(dto.deviceSessionId));
  }

  @Public()
  @Post('biometric/verify')
  async biometric(@Body() dto: BiometricVerifyDto, @Req() req: Request) {
    return new ResponseDto('Signed in', await this.auth.biometricVerify(dto.deviceSessionId, dto.signature, this.meta(req)));
  }

  @ApiBearerAuth()
  @Post('sessions/:id/biometric-key')
  async biometricKey(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: BiometricKeyDto) {
    return new ResponseDto('Device key registered', await this.auth.registerBiometricKey(user.id, id, dto.publicKey));
  }

  private meta(req: Request) {
    return {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }
}
