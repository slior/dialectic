import { Test, TestingModule } from '@nestjs/testing';
import { DebateModule } from './debate.module';
import { DebateGateway } from './debate.gateway';
import { DebateService } from './debate.service';

describe('DebateModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [DebateModule],
    }).compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide DebateGateway', () => {
    const gateway = module.get<DebateGateway>(DebateGateway);
    expect(gateway).toBeDefined();
    expect(gateway).toBeInstanceOf(DebateGateway);
  });

  it('should provide DebateService', () => {
    const service = module.get<DebateService>(DebateService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(DebateService);
  });

  it('should export DebateService', () => {
    const exportedService = module.get<DebateService>(DebateService);
    expect(exportedService).toBeDefined();
  });
});

