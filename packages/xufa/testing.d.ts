// xufa/testing: the tests of a project (Django's TestCase): useTestApp(), and the fixtures (loaddata).
import type { XufaInstance, TestClient } from '@xufa/http';
import type { Project, ProjectConfig } from './project.js';

export interface TestAppOptions {
  /** The folder of the project (the first one with a xufa.yaml from the working folder up). */
  root?: string;
  /** Fixtures loaded before each test: names of files of fixtures/ or seeds/ (library, or library.yaml). */
  fixtures?: string | string[];
  /** The database of the tests ('sqlite::memory:'). */
  databaseUrl?: string;
  /** The database of each tenant ('sqlite::memory:' unless overrides give tenants.database); rolled back too. */
  tenantsUrl?: string;
  /** Options of scrypt ({ ln: 4 }: light). */
  passwordOptions?: Record<string, unknown>;
  /** Each test in a transaction rolled back (true). */
  rollback?: boolean;
  /** The hooks of the runner (globals of vyntra, jest or vitest; else those of node:test). */
  hooks?: {
    before: (fn: () => unknown) => void;
    after: (fn: () => unknown) => void;
    beforeEach: (fn: () => unknown) => void;
    afterEach: (fn: () => unknown) => void;
  };
  /** Values over the configuration of xufa.yaml. */
  overrides?: Partial<ProjectConfig>;
  /** More options of project.build(). */
  build?: Record<string, unknown>;
}

/** The app of the tests: the app (ready once the tests run), and what the tests use. */
export type TestApp = XufaInstance & {
  /** The emails sent in the test (Django's mail.outbox), as the console writes them. */
  readonly mails: string[];
  readonly project: Project;
  /** A TestClient of the app (Django's self.client). */
  client(options?: { headers?: Record<string, string>; enforceCsrfChecks?: boolean }): TestClient;
  /** A user of auth.user, by its login field (auth.loginBy, else email), with its password hashed. */
  createUser(login: string, password: string, values?: Record<string, unknown>): Promise<any>;
};

/** Builds the app of xufa.yaml for a file of tests: rolled back for each test, closed after them. */
export declare function useTestApp(options?: TestAppOptions): TestApp;

/** Objects by model ({ Book: [{ title }] }, $key, $refs, $unless), made with create(). */
export declare function loadFixture(
  spec: Record<string, unknown>,
  options: { modelOf: (name: string) => any; passwordOptions?: Record<string, unknown>; where?: string }
): Promise<{ skipped: boolean; made: Record<string, any[]> }>;
/** A file of fixtures (.yaml, .yml, .json or .js). */
export declare function loadFixtureFile(
  file: string,
  options: { modelOf: (name: string) => any; passwordOptions?: Record<string, unknown>; where?: string }
): Promise<{ skipped: boolean; made: Record<string, any[]> }>;

export declare const PASSWORD_OPTIONS: Readonly<{ ln: number }>;
