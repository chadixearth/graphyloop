/**
 * GraphyLoop feature planner — deterministic wave decomposition.
 *
 * The problem it fixes: asked for "an inventory system", a model typically
 * builds serially (schema, then API, then UI, then tests) or fans out blindly
 * and gets three agents inventing three incompatible shapes of the same table.
 * Both are avoidable. The fix is a fixed pipeline:
 *
 *   Wave 0  contract     ONE agent freezes schema + API + props + test scenarios
 *   Wave 1  builders     data ∥ backend ∥ frontend ∥ tests, each against the contract
 *   Wave 2  integration  drop the mocks, wire real calls, boot the happy path
 *   Wave 3  verify       tests ∥ typecheck/lint ∥ security ∥ performance ∥ review
 *   Wave 4  deploy       preflight, then gated preview -> production
 *
 * Wall clock is the slowest lane plus integration, not the sum of the lanes —
 * but only because Wave 0 exists. Parallelism without a frozen contract just
 * moves the cost into integration.
 *
 * Output is data, not prose: every task carries an id, a wave, dependsOn, the
 * files it exclusively owns, and its acceptance check, so it can be fed
 * straight into task_distribute and tracked.
 */

// Keyword → lane. Matching is whole-word on a lowercased goal, so "inventory
// management system" hits `system` (fullstack) and `inventory` (data), while
// "review the diff" does NOT hit the `view` frontend signal — substring matching
// made short tokens fire on unrelated words and invented lanes.
const SIGNALS = {
  fullstack: ['system', 'app', 'application', 'platform', 'portal', 'management', 'saas', 'crud', 'end-to-end', 'full stack', 'fullstack'],
  data: ['inventory', 'stock', 'order', 'orders', 'product', 'products', 'catalog', 'customer', 'customers', 'invoice', 'booking', 'reservation', 'schema', 'database', 'db', 'table', 'tables', 'migration', 'migrations', 'supabase', 'postgres', 'prisma', 'drizzle', 'model', 'models', 'seed', 'record', 'records', 'entity', 'entities', 'crud'],
  backend: ['api', 'endpoint', 'endpoints', 'backend', 'server', 'route', 'routes', 'service', 'services', 'webhook', 'rest', 'graphql', 'trpc', 'query', 'queries', 'mutation', 'business logic', 'validation'],
  frontend: ['ui', 'page', 'pages', 'dashboard', 'form', 'forms', 'screen', 'screens', 'component', 'components', 'frontend', 'front end', 'front-end', 'design', 'table', 'list', 'chart', 'charts', 'report', 'reports', 'view', 'client'],
  auth: ['auth', 'authentication', 'login', 'signup', 'sign in', 'sign-in', 'session', 'sessions', 'rbac', 'role', 'roles', 'permission', 'permissions', 'tenant', 'oauth', 'jwt'],
  payments: ['payment', 'payments', 'billing', 'checkout', 'subscription', 'subscriptions', 'stripe', 'payout'],
  uploads: ['upload', 'uploads', 'attachment', 'attachments', 'bucket', 'file storage', 'avatar', 's3'],
  pipeline: ['import', 'export', 'csv', 'excel', 'etl', 'sync', 'scrape', 'batch', 'cron', 'job', 'jobs', 'queue', 'ingest', 'seed'],
  realtime: ['realtime', 'real-time', 'websocket', 'websockets', 'subscription', 'notification', 'notifications', 'presence'],
  performance: ['performance', 'slow', 'optimize', 'scale', 'latency', 'throughput', 'cache', 'index', 'indexes'],
  deploy: ['deploy', 'deployment', 'ship', 'production', 'prod', 'vercel', 'release', 'host', 'hosting', 'go live'],
  docs: ['docs', 'documentation', 'readme', 'guide'],
};

const WORD_RE = new Map();
function matchesWord(haystack, keyword) {
  let re = WORD_RE.get(keyword);
  if (!re) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    WORD_RE.set(keyword, re);
  }
  return re.test(haystack);
}

const SENSITIVE_LANES = ['auth', 'payments', 'uploads'];

/** Engine agent type per lane (must stay inside lib/engine.mjs DEFAULT_CAPS). */
const LANE_AGENTS = {
  contract: { type: 'design', engine: 'architect', harness: 'chadi-architect' },
  data: { type: 'schema', engine: 'data', harness: 'chadi-data' },
  backend: { type: 'implement', engine: 'coder', harness: 'chadi-backend' },
  frontend: { type: 'ui', engine: 'frontend', harness: 'chadi-frontend' },
  pipeline: { type: 'implement', engine: 'coder', harness: 'chadi-backend' },
  tests: { type: 'test', engine: 'tester', harness: 'chadi-test' },
  integration: { type: 'implement', engine: 'coder', harness: 'chadi-integrator' },
  quality: { type: 'validate', engine: 'tester', harness: 'chadi-quality' },
  security: { type: 'scan', engine: 'security', harness: 'chadi-security' },
  performance: { type: 'analyze', engine: 'reviewer', harness: 'chadi-performance' },
  review: { type: 'review', engine: 'reviewer', harness: 'chadi-reviewer' },
  deploy: { type: 'implement', engine: 'coder', harness: 'chadi-devops' },
  docs: { type: 'review', engine: 'reviewer', harness: 'chadi-docs' },
};

const OWNS = {
  data: ['supabase/migrations/**', 'prisma/schema.prisma', 'drizzle/**', 'db/**', 'seed/**'],
  backend: ['app/api/**', 'src/app/api/**', 'src/server/**', 'src/services/**', 'src/lib/db/**'],
  frontend: ['app/**/page.tsx', 'src/app/**/page.tsx', 'src/components/**', 'src/features/**'],
  pipeline: ['scripts/**', 'src/jobs/**', 'src/importers/**'],
  tests: ['tests/**', '**/*.test.ts', '**/*.spec.ts', 'e2e/**'],
};

export function slugify(text) {
  return String(text || 'feature')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'feature';
}

function detectLanes(goal) {
  const g = String(goal || '').toLowerCase();
  const hit = (lane) => SIGNALS[lane].some((kw) => matchesWord(g, kw));
  const matched = new Set();
  for (const lane of Object.keys(SIGNALS)) if (hit(lane)) matched.add(lane);

  // "inventory system" names no layer explicitly but implies all three; a bare
  // "add an endpoint" implies exactly one. Only the first case expands.
  if (matched.has('fullstack')) {
    matched.add('data');
    matched.add('backend');
    matched.add('frontend');
  }
  // Auth/payments/uploads always need a server side, whatever else was said.
  if (SENSITIVE_LANES.some((l) => matched.has(l))) matched.add('backend');
  return matched;
}

/**
 * Build the wave plan for a feature request.
 *
 * @param {object} args
 * @param {string} args.goal            what the user asked for, verbatim
 * @param {object} [args.stack]         detectStack() output, when available
 * @param {boolean} [args.includeDeploy] force the deploy wave on
 * @param {number} [args.maxParallel]   local builder cap (default 4, RAM-bound)
 */
export function planFeature({ goal, stack, includeDeploy, maxParallel } = {}) {
  const text = String(goal || '').trim();
  if (!text) return { error: 'need a goal, e.g. "inventory system with stock levels and a dashboard"' };
  if (text.length > 4000) return { error: 'goal exceeds 4000 characters — summarize it first' };

  const lanes = detectLanes(text);
  if (includeDeploy) lanes.add('deploy');
  const sensitive = SENSITIVE_LANES.filter((l) => lanes.has(l));
  const slug = slugify(text);
  const builders = ['data', 'backend', 'frontend', 'pipeline'].filter((l) => lanes.has(l));
  const cap = Math.max(1, Number(maxParallel) || 4);

  // Nothing structural matched: a planner that invents five lanes for "rename a
  // prop" is worse than no planner. Say so and stop.
  if (builders.length === 0) {
    return {
      ok: true,
      goal: text, slug,
      shape: 'no-fanout',
      lanes: [...lanes],
      waves: [],
      tasks: [],
      recommendation: 'This does not read as a multi-layer feature. Handle it inline (trivial lane) or as a single-builder Standard task — fan-out would only add integration cost.',
      notes: ['no data/backend/frontend/pipeline signal found in the goal; add detail (entities, endpoints, screens) to get a wave plan'],
    };
  }

  const framework = stack && stack.frameworkLabel ? stack.frameworkLabel : null;
  const dbNote = stack && stack.db && stack.db.supabase ? 'Supabase' : (stack && stack.db && stack.db.orm) || 'the project database';
  const contractFile = `.opencode/chadi/contract-${slug}.md`;

  const shape = builders.length >= 3
    ? (sensitive.length ? 'heavy-fullstack' : 'fullstack')
    : builders.length === 2 ? 'two-lane' : 'single-service';

  const tasks = [];
  const add = (t) => { tasks.push(t); return t.id; };

  // ---- Wave 0: the one thing that must not be parallel -------------------
  const contractId = 'w0-contract';
  add({
    id: contractId,
    wave: 0,
    lane: 'contract',
    type: LANE_AGENTS.contract.type,
    agent: LANE_AGENTS.contract.harness,
    engineType: LANE_AGENTS.contract.engine,
    priority: 'high',
    dependsOn: [],
    owns: [contractFile],
    description: [
      `Freeze the contract for: ${text}.`,
      `Write ${contractFile} containing ONLY: (1) entity list with columns, types, nullability, FKs and indexes;`,
      '(2) every API route with method, path, request shape, response JSON and error codes;',
      '(3) component/page list with props and route paths;',
      '(4) the test scenarios that define "done" (happy path + 2 edge cases per entity);',
      '(5) the env keys the feature needs.',
      framework ? `Target stack: ${framework} + ${dbNote}.` : `Database layer: ${dbNote}.`,
      'Do NOT write implementation code in this wave. No other agent starts until this file exists.',
    ].join(' '),
    acceptance: `${contractFile} exists and covers entities, routes, props, test scenarios and env keys`,
  });

  // ---- Wave 1: every builder at once, all reading the same contract ------
  const laneSpecs = {
    data: {
      description: [
        'Implement the schema exactly as frozen in the contract:',
        'migration files (never dashboard-only edits), constraints, indexes, and row-level security policies for every table.',
        'Add a seed script with realistic sample rows. Run the migration dry-run locally; do NOT push to a hosted database in this wave.',
      ].join(' '),
      acceptance: 'migration + RLS policy files exist, dry-run prints the expected SQL, seed script runs locally',
    },
    backend: {
      description: [
        'Implement every API route in the contract against the frozen schema:',
        'input validation on each endpoint, parameterized queries only, typed responses matching the contract JSON exactly, real error codes.',
        'No UI work. Do not change the contract — if it is wrong, stop and report instead of drifting.',
      ].join(' '),
      acceptance: 'each contract route responds with the contracted shape; invalid input is rejected with the contracted error code',
    },
    frontend: {
      description: [
        'Build the pages/components in the contract against MOCKED data shaped exactly like the contracted responses.',
        'Cover loading, empty and error states, keyboard access and labels. No direct database access from client components.',
        'Mocks get swapped for real calls in the integration wave — keep the fetch layer in one module so that swap is a single file.',
      ].join(' '),
      acceptance: 'pages render from mocks with loading/empty/error states; typecheck and build pass',
    },
    pipeline: {
      description: [
        'Build the import/export path named in the goal: parse, validate row-by-row, report rejected rows with reasons, and write through the same schema constraints as the API.',
        'Idempotent re-runs (no duplicate rows on a second import).',
      ].join(' '),
      acceptance: 'a sample file imports cleanly, a malformed file reports per-row errors, re-running does not duplicate data',
    },
  };

  const builderIds = builders.map((lane) => add({
    id: `w1-${lane}`,
    wave: 1,
    lane,
    type: LANE_AGENTS[lane].type,
    agent: LANE_AGENTS[lane].harness,
    engineType: LANE_AGENTS[lane].engine,
    priority: lane === 'data' ? 'high' : 'medium',
    dependsOn: [contractId],
    owns: OWNS[lane] || [],
    description: `${laneSpecs[lane].description} Contract: ${contractFile}.`,
    acceptance: laneSpecs[lane].acceptance,
  }));

  // Tests are written in Wave 1, not Wave 3: the contract's scenarios are
  // already the spec, and a test authored after the code tends to assert
  // whatever the code happens to do.
  const testScaffoldId = add({
    id: 'w1-tests',
    wave: 1,
    lane: 'tests',
    type: LANE_AGENTS.tests.type,
    agent: LANE_AGENTS.tests.harness,
    engineType: LANE_AGENTS.tests.engine,
    priority: 'medium',
    dependsOn: [contractId],
    owns: OWNS.tests,
    description: [
      `Turn the contract's test scenarios into executable tests BEFORE integration:`,
      'unit tests for validation rules, API tests per contracted route (happy path + contracted error codes), and one end-to-end happy path.',
      'Tests are expected to fail until the integration wave — that is the point. No browser test beyond the single critical flow.',
    ].join(' '),
    acceptance: 'test files exist for every contracted route and scenario, and fail for the right reason (missing implementation, not a broken test)',
  });

  // ---- Wave 2: the join ---------------------------------------------------
  const integrationId = add({
    id: 'w2-integration',
    wave: 2,
    lane: 'integration',
    type: LANE_AGENTS.integration.type,
    agent: LANE_AGENTS.integration.harness,
    engineType: LANE_AGENTS.integration.engine,
    priority: 'high',
    dependsOn: [...builderIds, testScaffoldId],
    owns: ['src/lib/api/**', 'src/lib/supabase/**', '.env.example'],
    description: [
      'Join the lanes: replace frontend mocks with real API calls, apply the migration to the local/dev database (dry-run first),',
      'run env_sync so the app reads real credentials from its env file, then boot the app and walk the happy path end to end.',
      'Fix contract drift here and record every deviation — this is the only wave allowed to touch two lanes at once.',
    ].join(' '),
    acceptance: 'app boots, the happy path works against the real database, and the Wave 1 tests now pass',
  });

  // ---- Wave 3: verification, all read-only, all at once -------------------
  const verifyLanes = ['tests', 'quality', 'review'];
  if (sensitive.length || lanes.has('data')) verifyLanes.push('security');
  if (lanes.has('performance') || shape.includes('fullstack')) verifyLanes.push('performance');
  if (lanes.has('docs')) verifyLanes.push('docs');

  const verifySpecs = {
    tests: {
      id: 'w3-test',
      description: 'Run the full suite plus the end-to-end happy path. Report the command and the decisive output line, not a summary claim.',
      acceptance: 'suite green, with the command and pass/fail counts quoted',
    },
    quality: {
      id: 'w3-quality',
      description: 'Run typecheck, lint and a production build on the changed area. Fix only mechanical violations; report anything structural.',
      acceptance: 'typecheck + lint + build exit 0',
    },
    security: {
      id: 'w3-security',
      description: [
        'Audit the feature: RLS enabled and actually restrictive on every new table, service-role key never referenced from client code or a NEXT_PUBLIC_*/VITE_* var,',
        'input validation on every endpoint, authz check per route (not just authn), no secret in the repo or the build output.',
        sensitive.length ? `Sensitive surface detected (${sensitive.join(', ')}) — this review is mandatory, not optional.` : '',
      ].join(' ').trim(),
      acceptance: 'each item checked with a file:line finding or an explicit pass',
    },
    performance: {
      id: 'w3-performance',
      description: 'Measure, do not guess: query count per request (N+1), missing indexes on filtered/joined columns, payload and bundle size for the new pages. Report before/after numbers.',
      acceptance: 'measured numbers reported; each finding names the file and the fix',
    },
    review: {
      id: 'w3-review',
      description: 'Review the whole diff against the contract: shape mismatches, dead code, swallowed errors, missing error states, scope creep. Report as path:line: severity: problem.',
      acceptance: 'findings listed with severity, or an explicit clean verdict',
    },
    docs: {
      id: 'w3-docs',
      description: 'Document the feature: env keys required, how to run migrations, the API surface, and the rollback path.',
      acceptance: 'docs updated and match the shipped contract',
    },
  };

  const verifyIds = verifyLanes.map((lane) => add({
    id: verifySpecs[lane].id,
    wave: 3,
    lane,
    type: LANE_AGENTS[lane].type,
    agent: LANE_AGENTS[lane].harness,
    engineType: LANE_AGENTS[lane].engine,
    priority: lane === 'security' ? 'high' : 'medium',
    dependsOn: [integrationId],
    owns: [],
    description: verifySpecs[lane].description,
    acceptance: verifySpecs[lane].acceptance,
  }));

  // ---- Wave 4: deploy, gated ---------------------------------------------
  if (lanes.has('deploy')) {
    add({
      id: 'w4-deploy',
      wave: 4,
      lane: 'deploy',
      type: LANE_AGENTS.deploy.type,
      agent: LANE_AGENTS.deploy.harness,
      engineType: LANE_AGENTS.deploy.engine,
      priority: 'high',
      dependsOn: verifyIds,
      owns: ['vercel.json', '.github/workflows/**'],
      gate: 'user-approval — a production deploy is user-visible and needs an explicit go plus a rollback plan',
      description: [
        'Run preflight target=deploy and clear every blocker first. Mirror each runtime env key in the Vercel project (a local .env.local is not deployed).',
        'Apply database migrations to the production database BEFORE the app deploy, with a dry-run and a rollback note.',
        'Ship a preview deployment, verify the real URL, then ask for approval before --prod.',
      ].join(' '),
      acceptance: 'preview URL verified; production deploy only after explicit approval, with the rollback command recorded',
    });
  }

  const waveList = [...new Set(tasks.map((t) => t.wave))].sort((a, b) => a - b).map((wave) => {
    const ids = tasks.filter((t) => t.wave === wave).map((t) => t.id);
    const names = { 0: 'contract', 1: 'builders', 2: 'integration', 3: 'verify', 4: 'deploy' };
    return {
      wave,
      name: names[wave] || `wave-${wave}`,
      parallel: ids.length > 1,
      taskIds: ids,
      dispatch: ids.length > 1
        ? `dispatch all ${ids.length} as parallel task calls in ONE tool-call block`
        : 'single task — run it alone, everything downstream waits on it',
    };
  });

  const secretsNeeded = [];
  if (lanes.has('data')) secretsNeeded.push('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
  if (lanes.has('deploy')) secretsNeeded.push('VERCEL_TOKEN');

  const notes = [
    `Wall clock = Wave 0 + slowest Wave 1 lane + integration + slowest verifier — not the sum of ${builders.length} lanes.`,
    `Local builder cap is ${cap} concurrent (RAM-bound); read-only verifiers may run up to 8.`,
    'Every Wave 1 prompt must carry: the contract file path, that lane\'s owned file list, and its acceptance check. Two agents never own the same file in one wave.',
  ];
  if (sensitive.length) notes.push(`Sensitive lanes (${sensitive.join(', ')}) → Heavy lane: discuss gate before Wave 1 and a mandatory security pass in Wave 3.`);
  if (lanes.has('data')) notes.push('Database work is Wave 0 + Wave 1, never an afterthought: the schema is what the other lanes are built against.');
  if (secretsNeeded.length) notes.push(`Run secrets_status before Wave 2 — integration fails late and confusingly when ${secretsNeeded[0]} is missing.`);

  return {
    ok: true,
    goal: text,
    slug,
    shape,
    lane: sensitive.length ? 'heavy' : 'standard',
    lanes: [...lanes],
    sensitive,
    contract: {
      file: contractFile,
      freeze: ['entities + columns + indexes', 'API routes + request/response JSON', 'component props + routes', 'test scenarios', 'env keys'],
    },
    waves: waveList,
    tasks,
    squad: {
      engineTypes: [...new Set(tasks.map((t) => t.engineType))],
      harnessAgents: [...new Set(tasks.map((t) => t.agent))],
      maxParallelBuilders: Math.min(cap, builders.length + 1),
    },
    secretsNeeded: [...new Set(secretsNeeded)],
    nextStep: 'pass plan.tasks to task_distribute (wave + dependsOn are honoured), dispatch wave 0, then record each result so the next wave unblocks',
    notes,
  };
}

export default { planFeature, slugify };
