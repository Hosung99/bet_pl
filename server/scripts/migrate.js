import fs from 'node:fs/promises'
import { pool } from '../db.js'

try {
  const sql = await fs.readFile(new URL('../schema.sql', import.meta.url), 'utf8')
  await pool.query(sql)
  console.log('Database schema is ready.')
} finally {
  await pool.end()
}
