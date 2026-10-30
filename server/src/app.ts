import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z, ZodError } from 'zod';
import { focusSchema, planSchema, scopeSchema, type GenerateEvent, type PreviewEvent } from '../../shared/plan';
import {
  attemptLimiter,
  hashPassword,
  hashToken,
  newSessionToken,
  NO_ACCOUNT_HASH,
  readCookie,
  SESSION_COOKIE,
  SESSION_MS,
  verifyPassword,
} from './auth';
import type { Store } from './db';
import { HttpError } from './errors';
import type { Llm } from './llm';
import { runDetails, runPipeline, runPreview } from './pipeline';

const createSchema = z.object({ name: z.string().trim().min(1).max(120) });
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  plan: planSchema.optional(),
});
const generateSchema = z.object({
  text: z.string().trim().min(1),
  scope: scopeSchema.default('project'),
  source: z.string().max(20000).optional(),
  focus: focusSchema.optional(),
  askQuestions: z.boolean().default(true),
});
const detailsSchema = focusSchema;
const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});
const MIN_PASSWORD = 8;

const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const TOO_MANY = 'Too many tries. Wait a few minutes and try again.';

// OpenAI's transcription endpoint rejects files over 25 MB.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const CLIENT_DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

const sameSecret = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

// Set when the app is reachable by others. Shared links stay open on purpose.
function requirePassword(password: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/shared/')) return next();
    const [scheme, encoded] = (req.headers.authorization ?? '').split(' ');
    const given = Buffer.from(encoded ?? '', 'base64').toString().split(':').slice(1).join(':');
    if (scheme === 'Basic' && sameSecret(given, password)) return next();
    res.set('WWW-Authenticate', 'Basic realm="BuildFlow"').status(401).json({ error: 'Password required' });
  };
}

export function createApp(store: Store, llm: Llm, { password }: { password?: string } = {}) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  if (password) app.use('/api', requirePassword(password));

  const logins = attemptLimiter(ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS);
  const signups = attemptLimiter(ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS);

  const sessionHash = (req: Request) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    return token ? hashToken(token) : undefined;
  };

  const cookieOptions = (req: Request) => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    path: '/',
  });

  const startSession = async (req: Request, res: Response, userId: string) => {
    const token = newSessionToken();
    await store.createSession(hashToken(token), userId, new Date(Date.now() + SESSION_MS));
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_MS });
  };

  const currentUser = async (req: Request) => {
    const hash = sessionHash(req);
    return hash ? store.sessionUser(hash) : undefined;
  };

  app.get('/api/auth/me', async (req, res) => {
    res.json({ user: (await currentUser(req)) ?? null });
  });

  app.post('/api/auth/signup', async (req, res) => {
    const key = req.ip ?? '';
    if (signups.blocked(key)) throw new HttpError(429, TOO_MANY);
    signups.hit(key);
    const { email, password } = credentialsSchema.parse(req.body);
    if (password.length < MIN_PASSWORD) {
      throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters for your password`);
    }
    const user = await store.createUser(email, await hashPassword(password));
    if (!user) throw new HttpError(409, 'That email already has an account');
    await startSession(req, res, user.id);
    res.status(201).json({ user });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);
    const key = `${req.ip}:${email}`;
    if (logins.blocked(key)) throw new HttpError(429, TOO_MANY);
    const user = await store.findUser(email);
    const matches = await verifyPassword(password, user?.password_hash ?? NO_ACCOUNT_HASH);
    if (!user || !matches) {
      logins.hit(key);
      throw new HttpError(401, 'Wrong email or password');
    }
    logins.clear(key);
    await startSession(req, res, user.id);
    res.json({ user: { id: user.id, email: user.email } });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const hash = sessionHash(req);
    if (hash) await store.deleteSession(hash);
    res.clearCookie(SESSION_COOKIE, cookieOptions(req)).status(204).end();
  });

  app.use('/api/projects', async (req, res, next) => {
    const user = await currentUser(req);
    if (!user) throw new HttpError(401, 'Log in to continue');
    res.locals.userId = user.id;
    next();
  });

  const ownerOf = (res: Response): string => res.locals.userId;

  // Another person's project looks exactly like one that does not exist.
  const findProject = async (id: string, res: Response) => {
    const project = await store.get(id, ownerOf(res));
    if (!project) throw new HttpError(404, 'Project not found');
    return project;
  };

  app.get('/api/projects', async (_req, res) => {
    res.json(await store.list(ownerOf(res)));
  });

  app.post('/api/projects', async (req, res) => {
    res.status(201).json(await store.create(createSchema.parse(req.body).name, ownerOf(res)));
  });

  app.get('/api/projects/:id', async (req, res) => {
    res.json(await findProject(req.params.id, res));
  });

  app.put('/api/projects/:id', async (req, res) => {
    const project = await store.update(req.params.id, ownerOf(res), updateSchema.parse(req.body));
    if (!project) throw new HttpError(404, 'Project not found');
    res.json(project);
  });

  app.post('/api/projects/:id/share', async (req, res) => {
    const project = await store.setShare(req.params.id, ownerOf(res), true);
    if (!project) throw new HttpError(404, 'Project not found');
    res.json({ shareId: project.shareId });
  });

  app.delete('/api/projects/:id/share', async (req, res) => {
    if (!(await store.setShare(req.params.id, ownerOf(res), false))) throw new HttpError(404, 'Project not found');
    res.status(204).end();
  });

  // Only what a viewer needs: never the raw transcript.
  app.get('/api/shared/:shareId', async (req, res) => {
    const project = await store.getShared(req.params.shareId);
    if (!project) throw new HttpError(404, 'This link is no longer shared');
    res.json({ name: project.name, plan: project.plan });
  });

  app.delete('/api/projects/:id', async (req, res) => {
    if (!(await store.remove(req.params.id, ownerOf(res)))) throw new HttpError(404, 'Project not found');
    res.status(204).end();
  });

  app.post('/api/projects/:id/transcribe', upload.single('audio'), async (req, res) => {
    await findProject(req.params.id as string, res);
    if (!req.file) throw new HttpError(400, 'No audio was uploaded');
    res.json({ text: await llm.transcribe(req.file.buffer, req.file.mimetype) });
  });

  app.post('/api/projects/:id/generate', async (req, res) => {
    const { text, scope, source, focus, askQuestions } = generateSchema.parse(req.body);
    const project = await findProject(req.params.id, res);
    if (focus && !project.plan.boards[focus.board].nodes.some((n) => n.id === focus.nodeId)) {
      throw new HttpError(404, 'That node no longer exists');
    }
    const send = (event: GenerateEvent) => {
      if (!res.headersSent) res.type('application/x-ndjson');
      res.write(`${JSON.stringify(event)}\n`);
    };

    // Nothing is written until the first model call succeeds, so early failures
    // still reach the error handler as a normal status code.
    try {
      const plan = await runPipeline(text, project.plan, llm.complete, {
        scope,
        source,
        focus,
        askQuestions,
        onRequirements: (requirements, questions) =>
          send({ type: 'requirements', requirements, questions }),
        onItem: send,
      });
      const transcript = project.transcript ? `${project.transcript}\n\n${text}` : text;
      const updated = await store.update(project.id, ownerOf(res), { plan, transcript });
      if (!updated) throw new HttpError(404, 'Project not found');
      send({ type: 'done', project: updated });
      res.end();
    } catch (error) {
      if (!res.headersSent) throw error;
      console.error(error);
      send({ type: 'error', error: error instanceof Error ? error.message : 'Generation failed' });
      res.end();
    }
  });

  // The client saves the result with the node, since it owns the live board.
  app.post('/api/projects/:id/details', async (req, res) => {
    const { board, nodeId } = detailsSchema.parse(req.body);
    const project = await findProject(req.params.id, res);
    const node = project.plan.boards[board].nodes.find((n) => n.id === nodeId);
    if (!node) throw new HttpError(404, 'Node not found');
    res.json(await runDetails(project, board, node, llm.complete));
  });

  app.post('/api/projects/:id/preview', async (req, res) => {
    const project = await findProject(req.params.id, res);
    const send = (event: PreviewEvent) => {
      if (!res.headersSent) res.type('application/x-ndjson');
      res.write(`${JSON.stringify(event)}\n`);
    };

    try {
      const preview = await runPreview(project.name, project.plan, llm.design, (text) =>
        send({ type: 'delta', text }),
      );
      const updated = await store.update(project.id, ownerOf(res), { plan: { ...project.plan, preview } });
      if (!updated) throw new HttpError(404, 'Project not found');
      send({ type: 'done', project: updated });
      res.end();
    } catch (error) {
      if (!res.headersSent) throw error;
      console.error(error);
      send({ type: 'error', error: error instanceof Error ? error.message : 'Preview failed' });
      res.end();
    }
  });

  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else if (error instanceof ZodError) {
      res.status(400).json({ error: 'Invalid request', details: error.issues });
    } else if (error instanceof multer.MulterError) {
      res.status(400).json({ error: error.message });
    } else {
      console.error(error);
      res.status(502).json({ error: error instanceof Error ? error.message : 'Generation failed' });
    }
  });

  return app;
}
