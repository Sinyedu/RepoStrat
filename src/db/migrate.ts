import { parseConfig } from '../config.js';
import { openDatabase } from './index.js';

const database = openDatabase(parseConfig(process.env).DATABASE_URL);
database.close();
