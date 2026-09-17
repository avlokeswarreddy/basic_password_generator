const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'password_manager.sql');
const schemaPath = path.join(__dirname, 'schema.sql');

const db = new sqlite3.Database(dbPath);

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function ensureTables() {
  return new Promise((resolve, reject) => {
    const schemaSql = fs.existsSync(schemaPath)
      ? fs.readFileSync(schemaPath, 'utf8')
      : `
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          website TEXT NOT NULL,
          username TEXT NOT NULL,
          password TEXT NOT NULL,
          note TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `;

    db.serialize(() => {
      db.exec(schemaSql, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

function getMasterPasswordHash() {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', ['master_password'], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.value : null);
    });
  });
}

function isValidMasterPassword(password) {
  return new Promise(async (resolve) => {
    try {
      const hash = await getMasterPasswordHash();
      resolve(Boolean(hash && hashPassword(password) === hash));
    } catch (error) {
      resolve(false);
    }
  });
}

function requireMasterPassword(req, res, next) {
  const masterPassword = req.headers['x-master-password'] || req.body.masterPassword;

  if (!masterPassword) {
    return res.status(401).json({ error: 'Master password required.' });
  }

  isValidMasterPassword(masterPassword).then((valid) => {
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect master password.' });
    }
    next();
  });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', async (req, res) => {
  try {
    const masterPasswordHash = await getMasterPasswordHash();
    res.json({ hasMasterPassword: Boolean(masterPasswordHash) });
  } catch (error) {
    res.status(500).json({ error: 'Unable to fetch config.' });
  }
});

app.post('/api/setup', async (req, res) => {
  const { password } = req.body;

  if (!password || String(password).length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
  }

  try {
    const existingHash = await getMasterPasswordHash();
    if (existingHash) {
      return res.status(400).json({ error: 'A master password is already configured.' });
    }

    const passwordHash = hashPassword(password);
    db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['master_password', passwordHash], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Unable to save master password.' });
      }
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ error: 'Setup failed.' });
  }
});

app.post('/api/unlock', async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  try {
    const valid = await isValidMasterPassword(password);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect master password.' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Unable to unlock vault.' });
  }
});

app.get('/api/entries', requireMasterPassword, async (req, res) => {
  const search = (req.query.search || '').trim();
  const sql = search
    ? `SELECT * FROM entries WHERE website LIKE ? OR username LIKE ? ORDER BY created_at DESC`
    : 'SELECT * FROM entries ORDER BY created_at DESC';
  const params = search ? [`%${search}%`, `%${search}%`] : [];

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to fetch entries.' });
    }
    res.json(rows);
  });
});

app.post('/api/entries', requireMasterPassword, (req, res) => {
  const { website, username, password, note } = req.body;

  if (!website || !username || !password) {
    return res.status(400).json({ error: 'Website, username, and password are required.' });
  }

  db.run(
    'INSERT INTO entries (website, username, password, note) VALUES (?, ?, ?, ?)',
    [website.trim(), username.trim(), String(password), note ? String(note).trim() : ''],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Unable to save password.' });
      }

      db.get('SELECT * FROM entries WHERE id = ?', [this.lastID], (rowErr, row) => {
        if (rowErr || !row) {
          return res.status(500).json({ error: 'Password saved but could not be retrieved.' });
        }
        res.status(201).json(row);
      });
    },
  );
});

app.put('/api/entries/:id', requireMasterPassword, (req, res) => {
  const { id } = req.params;
  const { website, username, password, note } = req.body;

  if (!website || !username || !password) {
    return res.status(400).json({ error: 'Website, username, and password are required.' });
  }

  db.run(
    'UPDATE entries SET website = ?, username = ?, password = ?, note = ? WHERE id = ?',
    [website.trim(), username.trim(), String(password), note ? String(note).trim() : '', id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Unable to update entry.' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Entry not found.' });
      }

      db.get('SELECT * FROM entries WHERE id = ?', [id], (rowErr, row) => {
        if (rowErr || !row) {
          return res.status(500).json({ error: 'Updated entry could not be retrieved.' });
        }
        res.json(row);
      });
    },
  );
});

app.delete('/api/entries/:id', requireMasterPassword, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM entries WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Unable to delete entry.' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Entry not found.' });
    }

    res.json({ success: true });
  });
});

app.delete('/api/reset-vault', (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM entries', (entryErr) => {
      if (entryErr) {
        return res.status(500).json({ error: 'Unable to clear saved entries.' });
      }

      db.run('DELETE FROM settings WHERE key = ?', ['master_password'], (settingsErr) => {
        if (settingsErr) {
          return res.status(500).json({ error: 'Unable to clear master password.' });
        }

        res.json({ success: true });
      });
    });
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

ensureTables()
  .then(() => {
    app.listen(port, () => {
      console.log(`Password manager server running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
