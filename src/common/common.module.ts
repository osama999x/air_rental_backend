import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtCustomService } from './providers/jwt.service';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [JwtCustomService],
  exports: [JwtCustomService, JwtModule],
})
export class CommonModule {}
