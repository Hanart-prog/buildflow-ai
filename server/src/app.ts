import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z, ZodError } from 'zod';
import { planSchema } from '../../shared/plan';
import type { Store } from './db';
import { HttpError } from './errors';
import type { Llm } from './llm';
import { runPipeline } from './pipeline';

const createSchema = z.object({ name: z.string().trim().min(1).max(120) });
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  plan: planSchema.optional(),
});
const generateSchema = z.object({ text: z.string().trim().min(1) });

// OpenAI's transcription endpoint rejects files over 25 MB.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export function createApp(store: Store, llm: Llm) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  const findProject = async (id: string) => {
    const project = await store.get(id);
    if (!project) throw new HttpError(404, 'Project not found');
    return project;
  };

  app.get('/api/projects', async (_req, res) => {
    res.json(await store.list());
  });

  app.post('/api/projects', async (req, res) => {
    res.status(201).json(await store.create(createSchema.parse(req.body).name));
  });

  app.get('/api/projects/:id', async (req, res) => {
    res.json(await findProject(req.params.id));
  });

  app.put('/api/projects/:id', async (req, res) => {
    const project = await store.update(req.params.id, updateSchema.parse(req.body));
    if (!project) throw new HttpError(404, 'Project not found');
    res.json(project);
  });

  app.delete('/api/projects/:id', async (req, res) => {
    if (!(await store.remove(req.params.id))) throw new HttpError(404, 'Project not found');
    res.status(204).end();
  });

  app.post('/api/projects/:id/transcribe', upload.single('audio'), async (req, res) => {
    await findProject(req.params.id as string);
    if (!req.file) throw new HttpError(400, 'No audio was uploaded');
    res.json({ text: await llm.transcribe(req.file.buffer, req.file.mimetype) });
  });

  app.post('/api/projects/:id/generate', async (req, res) => {
    const { text } = generateSchema.parse(req.body);
    const project = await findProject(req.params.id);
    const plan = await runPipeline(text, project.plan, llm.complete);
    const transcript = project.transcript ? `${project.transcript}\n\n${text}` : text;
    res.json(await store.update(project.id, { plan, transcript }));
  });

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
