import { Router, Request, Response } from 'express';
import db from '../db.js';
import type { EvaluationRecord } from '../types/evaluation.js';

const router = Router();

// ─── GET /api/evaluations ─────────────────────────────────────────────────────

router.get('/evaluations', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare(`
      SELECT id, ticker, timestamp, stage, verdict, setup_type,
             files_loaded, model, request_type, enrichment_json
      FROM evaluations
      ORDER BY timestamp DESC
    `).all() as Omit<EvaluationRecord, 'evaluation_text' | 'indicators_json'>[];
    res.json(rows);
  } catch (err) {
    console.error('[GET /evaluations]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/evaluations/:id ─────────────────────────────────────────────────

router.get('/evaluations/:id', (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(req.params.id) as EvaluationRecord | undefined;
    if (!row) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }
    res.json(row);
  } catch (err) {
    console.error('[GET /evaluations/:id]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── DELETE /api/evaluations/:id ─────────────────────────────────────────────

router.delete('/evaluations/:id', (req: Request, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM evaluations WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Evaluation not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /evaluations/:id]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/evaluations/bulk-delete ───────────────────────────────────────

router.post('/evaluations/bulk-delete', (req: Request, res: Response) => {
  try {
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array' });
      return;
    }
    const placeholders = ids.map(() => '?').join(', ');
    const result = db.prepare(`DELETE FROM evaluations WHERE id IN (${placeholders})`).run(...ids);
    res.json({ deleted: result.changes });
  } catch (err) {
    console.error('[POST /evaluations/bulk-delete]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
