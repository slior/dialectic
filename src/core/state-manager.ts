import fs from 'fs';
import path from 'path';
import { Contribution, DebateRound, DebateState, Solution } from '../types/debate.types';

export class StateManager {
  private debates: Map<string, DebateState> = new Map();
  private baseDir: string;

  constructor(baseDir: string = path.resolve(process.cwd(), 'debates')) {
    this.baseDir = baseDir;
    this.ensureDirectoryExists();
  }

  async createDebate(problem: string, context?: string): Promise<DebateState> {
    const now = new Date();
    const state: DebateState = {
      id: this.generateId(now),
      problem,
      context,
      status: 'running',
      currentRound: 0,
      rounds: [],
      createdAt: now,
      updatedAt: now,
    } as DebateState;

    this.debates.set(state.id, state);
    await this.save(state);
    return state;
  }

  async addContribution(debateId: string, contribution: Contribution): Promise<void> {
    const state = this.debates.get(debateId);
    if (!state) throw new Error(`Debate ${debateId} not found`);

    // Determine current round
    let round: DebateRound | undefined = state.rounds[state.currentRound - 1];
    if (!round) {
      round = {
        roundNumber: state.currentRound + 1,
        phase: contribution.type === 'proposal' ? 'proposal' : contribution.type === 'critique' ? 'critique' : 'refinement',
        contributions: [],
        timestamp: new Date(),
      };
      state.rounds.push(round);
      state.currentRound = round.roundNumber;
    }

    round.contributions.push(contribution);
    state.updatedAt = new Date();
    await this.save(state);
  }

  async completeDebate(debateId: string, solution: Solution): Promise<void> {
    const state = this.debates.get(debateId);
    if (!state) throw new Error(`Debate ${debateId} not found`);

    state.status = 'completed';
    state.finalSolution = solution;
    state.updatedAt = new Date();
    await this.save(state);
  }

  async failDebate(debateId: string, _error: Error): Promise<void> {
    const state = this.debates.get(debateId);
    if (!state) return;
    state.status = 'failed';
    state.updatedAt = new Date();
    await this.save(state);
  }

  async getDebate(debateId: string): Promise<DebateState | null> {
    const inMem = this.debates.get(debateId);
    if (inMem) return inMem;

    const filePath = path.join(this.baseDir, `${debateId}.json`);
    if (!fs.existsSync(filePath)) return null;
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    // revive dates
    parsed.createdAt = new Date(parsed.createdAt);
    parsed.updatedAt = new Date(parsed.updatedAt);
    return parsed as DebateState;
  }

  async listDebates(): Promise<DebateState[]> {
    const files = fs.existsSync(this.baseDir) ? await fs.promises.readdir(this.baseDir) : [];
    const debates: DebateState[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const id = file.replace(/\.json$/, '');
      const d = await this.getDebate(id);
      if (d) debates.push(d);
    }
    return debates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  private async save(state: DebateState): Promise<void> {
    const filePath = path.join(this.baseDir, `${state.id}.json`);
    const serialized = JSON.stringify(state, null, 2);
    await fs.promises.writeFile(filePath, serialized, 'utf-8');
  }

  private ensureDirectoryExists() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private generateId(now: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = now.getFullYear();
    const MM = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    const rand = Math.random().toString(36).slice(2, 6);
    return `deb-${yyyy}${MM}${dd}-${hh}${mm}${ss}-${rand}`;
  }
}
