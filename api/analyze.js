// Estimate nutrition from a food photo using Claude's vision model.
// The client downsizes the image first; we return a structured estimate the user confirms before saving.
import { getSession } from '../lib/session.js';

const MODEL = process.env.ANALYZE_MODEL || 'claude-sonnet-5';

const PROMPT = `You are a careful nutrition estimator. Look at this photo of food and estimate the nutrition for the portion actually visible.

Respond with ONLY a JSON object — no markdown fences, no prose — with exactly these keys:
{
  "name": short dish name (e.g. "Masala dosa with sambar"),
  "portion": short description of the visible portion (e.g. "1 dosa + 1 bowl sambar"),
  "calories": number (kcal),
  "protein": number (grams),
  "carbs": number (grams),
  "fats": number (grams),
  "fiber": number (grams),
  "confidence": "low" | "medium" | "high",
  "notes": one short sentence on the main assumption (oil used, portion size, hidden ingredients)
}

Rules:
- Assume Indian home or restaurant preparation unless the food is clearly something else.
- If several items are on the plate, estimate the TOTAL for everything visible and describe them in "name" and "portion".
- Account for cooking oil, ghee, chutneys, dressings and sauces — these are frequently the biggest hidden calories.
- Be realistic about portion size from visual cues (plate size, hand, cutlery).
- If the image does not show food, respond with exactly {"error":"not_food"}.`;

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) { res.status(401).json({ error: 'unauthorized' }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'not_configured', message: 'Photo analysis is not set up yet — add ANTHROPIC_API_KEY in your Vercel project settings and redeploy.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const { image, mediaType = 'image/jpeg', hint = '' } = body;
  if (!image || typeof image !== 'string') { res.status(400).json({ error: 'no_image' }); return; }

  const text = PROMPT + (hint ? `\n\nThe user adds this context: "${String(hint).slice(0, 200)}"` : '');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text },
          ],
        }],
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      res.status(502).json({ error: 'upstream', message: (j && j.error && j.error.message) || 'The analysis service returned an error.' });
      return;
    }

    const raw = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const clean = raw.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
    if (start < 0 || end < 0) { res.status(502).json({ error: 'bad_response', message: 'Could not read the estimate. Try again.' }); return; }
    const est = JSON.parse(clean.slice(start, end + 1));

    if (est.error) {
      res.status(422).json({ error: est.error, message: "That doesn't look like food — try another photo." });
      return;
    }

    const num = (v) => Math.max(0, Math.round((parseFloat(v) || 0) * 10) / 10);
    res.status(200).json({
      estimate: {
        name: String(est.name || 'Meal').slice(0, 80),
        portion: String(est.portion || '1 serving').slice(0, 60),
        calories: Math.round(num(est.calories)),
        protein: num(est.protein),
        carbs: num(est.carbs),
        fats: num(est.fats),
        fiber: num(est.fiber),
        confidence: ['low', 'medium', 'high'].includes(est.confidence) ? est.confidence : 'medium',
        notes: String(est.notes || '').slice(0, 200),
      },
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: String((e && e.message) || e) });
  }
}
