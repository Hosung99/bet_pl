import bcrypt from 'bcryptjs'
import { pool, transaction } from '../db.js'
import { createUser } from '../domain/points.js'

const username = process.argv[2]
if (!username || !/^[a-zA-Z0-9._-]{2,40}$/.test(username)) {
  console.error('Usage: npm run create-admin -- <username>')
  process.exit(1)
}

function readPassword(prompt) {
  if (process.env.ADMIN_PASSWORD) return Promise.resolve(process.env.ADMIN_PASSWORD)
  if (!process.stdin.isTTY) throw new Error('TTY가 아니면 ADMIN_PASSWORD 환경변수가 필요합니다.')

  return new Promise((resolve) => {
    process.stdout.write(prompt)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    let password = ''
    const onData = (key) => {
      if (key === '\r' || key === '\n') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.off('data', onData)
        process.stdout.write('\n')
        resolve(password)
      } else if (key === '\u0003') {
        process.exit(130)
      } else if (key === '\u007f') {
        password = password.slice(0, -1)
      } else {
        password += key
      }
    }
    process.stdin.on('data', onData)
  })
}

try {
  const password = await readPassword('Admin password: ')
  if (password.length < 8 || password.length > 12) throw new Error('비밀번호는 8~12자여야 합니다.')
  const passwordHash = await bcrypt.hash(password, 12)
  const user = await transaction((client) => createUser(client, { username, passwordHash, role: 'ADMIN' }))
  console.log(`Admin created: ${user.username}`)
} catch (error) {
  if (error.code === '23505') console.error('이미 존재하는 아이디입니다.')
  else console.error(error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
