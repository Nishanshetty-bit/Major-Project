import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../.env')
try {
  process.loadEnvFile(envPath)
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
