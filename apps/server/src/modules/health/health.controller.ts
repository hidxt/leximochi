import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { data: { status: 'ok'; uptimeSeconds: number } } {
    return { data: { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) } };
  }
}
