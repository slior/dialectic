import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { DebateModule } from './debate/debate.module';

describe('AppModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should import DebateModule', () => {
    const debateModule = module.get(DebateModule);
    expect(debateModule).toBeDefined();
  });
});

