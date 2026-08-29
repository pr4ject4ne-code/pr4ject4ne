import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { safeHttpUrl } from '@/lib/sanitize';

type MediaItem = { media_type: 'image' | 'video'; url: string; provider?: string };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      title,
      category,
      definition,
      description,
      signs_symptoms = [],
      process,
      dos,
      donts,
      things_to_look_out_for,
      implications,
      indication,
      contraindications,
      images = [],
      media = [],
      tags = [],
      region_tags = [],
      system_tags = [],
    } = body;

    if (!title || typeof title !== 'string') return NextResponse.json({ error: 'title required' }, { status: 400 });

    // Validate media URLs server-side for safety
    const sanitizedMedia: MediaItem[] = [];
    for (const m of media as MediaItem[]) {
      if (!m || typeof m.url !== 'string') continue;
      const safe = safeHttpUrl(m.url);
      if (!safe) continue; // drop unsafe entries
      sanitizedMedia.push({ media_type: m.media_type === 'video' ? 'video' : 'image', url: safe, provider: m.provider });
    }

    const inserted = await withTransaction(async (tx) => {
      const insertSql = `
        INSERT INTO first_aid (title, category, definition, description, signs_symptoms, process, dos, donts, things_to_look_out_for, implications, indication, contraindications, images, tags, region_tags, system_tags)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING id
      `;
      const res = await tx.query(insertSql, [
        title,
        category,
        definition,
        description,
        signs_symptoms,
        process,
        dos,
        donts,
        things_to_look_out_for,
        implications,
        indication,
        contraindications,
        images,
        tags,
        region_tags,
        system_tags,
      ]);
      const row = res.rows[0];
      const faId = row.id as string;

      for (const m of sanitizedMedia) {
        await tx.query(`INSERT INTO first_aid_media (first_aid_id, media_type, url, provider) VALUES ($1,$2,$3,$4)`, [
          faId,
          m.media_type,
          m.url,
          m.provider ?? null,
        ]);
      }
      return faId;
    });

    return NextResponse.json({ id: inserted }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const {
      title,
      category,
      definition,
      description,
      signs_symptoms = [],
      process,
      dos,
      donts,
      things_to_look_out_for,
      implications,
      indication,
      contraindications,
      images = [],
      media = [],
      tags = [],
      region_tags = [],
      system_tags = [],
    } = body;

    const sanitizedMedia: MediaItem[] = [];
    for (const m of media as MediaItem[]) {
      if (!m || typeof m.url !== 'string') continue;
      const safe = safeHttpUrl(m.url);
      if (!safe) continue;
      sanitizedMedia.push({ media_type: m.media_type === 'video' ? 'video' : 'image', url: safe, provider: m.provider });
    }

    await withTransaction(async (tx) => {
      const updSql = `
        UPDATE first_aid SET
          title = $1,
          category = $2,
          definition = $3,
          description = $4,
          signs_symptoms = $5,
          process = $6,
          dos = $7,
          donts = $8,
          things_to_look_out_for = $9,
          implications = $10,
          indication = $11,
          contraindications = $12,
          images = $13,
          tags = $14,
          region_tags = $15,
          system_tags = $16
        WHERE id = $17
      `;
      await tx.query(updSql, [
        title,
        category,
        definition,
        description,
        signs_symptoms,
        process,
        dos,
        donts,
        things_to_look_out_for,
        implications,
        indication,
        contraindications,
        images,
        tags,
        region_tags,
        system_tags,
        id,
      ]);

      // Replace media rows: delete existing and insert new ones
      await tx.query(`DELETE FROM first_aid_media WHERE first_aid_id = $1`, [id]);
      for (const m of sanitizedMedia) {
        await tx.query(`INSERT INTO first_aid_media (first_aid_id, media_type, url, provider) VALUES ($1,$2,$3,$4)`, [
          id,
          m.media_type,
          m.url,
          m.provider ?? null,
        ]);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 });
  }
}
