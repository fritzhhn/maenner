# Hosting on Hostinger with a database

This guide explains how to add a MySQL database on Hostinger so pins are shared for everyone who opens the site.

## 1. Add a database in Hostinger

1. Log in to **hPanel** (Hostinger control panel).
2. Go to **Databases** → **MySQL Databases** (or **Create Database**).
3. Create a new database:
   - **Database name**: e.g. `u123456789_map` (Hostinger often prefixes with your account ID).
   - **Username**: e.g. `u123456789_map`.
   - **Password**: choose a strong password and save it.
4. Note down:
   - **Database name**
   - **Username**
   - **Password**
   - **Host** (often `localhost`; sometimes e.g. `mysql123.hostinger.com` – check in the DB section).

## 2. Create the table (phpMyAdmin)

1. In hPanel, open **Databases** → **phpMyAdmin** (or the link to manage your DB).
2. Select your new database in the left sidebar.
3. Open the **SQL** tab.
4. Paste and run the contents of **schema.sql** from this project:

```sql
CREATE TABLE IF NOT EXISTS notes (
  id VARCHAR(64) PRIMARY KEY,
  note TEXT NOT NULL,
  lng DOUBLE NOT NULL,
  lat DOUBLE NOT NULL,
  created_at INT UNSIGNED NOT NULL,
  INDEX idx_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

5. Click **Go**. You should see a success message and a new `notes` table.

## 3. Configure the API

1. In your project, go to the **api** folder.
2. Copy **config.example.php** to **config.php**:
   - `cp api/config.example.php api/config.php`
3. Edit **api/config.php** and set your Hostinger database details:

```php
return [
    'host'     => 'localhost',           // or the host from step 1
    'dbname'   => 'u123456789_map',      // your database name
    'username' => 'u123456789_map',      // your database username
    'password' => 'your_password_here',  // your database password
    'charset'  => 'utf8mb4',
];
```

4. **Do not commit config.php** (it contains the password). Add it to **.gitignore**:

```
api/config.php
```

## 4. Upload the site to Hostinger

1. Upload your project files via **File Manager** or **FTP**.
2. Make sure the structure looks like this on the server:

   - `index.html`, `app.js`, `style.css`, etc. (at the root or in `public_html`)
   - `api/notes.php`
   - `api/config.php` (you create this on the server; do not upload from git if it’s ignored)
   - `api/config.example.php` (optional, for reference)

3. If your site lives in a subfolder (e.g. `public_html/maenner/`), set **API_BASE** in **app.js** so the API path is correct:

   - If the site is at `https://yoursite.com/maenner/`, the API is at `https://yoursite.com/maenner/api/notes.php`, and **API_BASE** should stay `"api"` (relative path).
   - If the site is at `https://yoursite.com/` and the API is at `https://yoursite.com/api/notes.php`, **API_BASE** = `"api"` is correct.

4. Create **api/config.php** on the server (via File Manager) with the same content as in step 3, using your real DB credentials.

## 5. Test

1. Open your site on Hostinger in the browser.
2. Add a pin and save. The pin should appear and stay after refresh.
3. Open the site in another device or incognito window: the same pins should appear (shared database).

## Troubleshooting

- **“Server config missing”**: Create **api/config.php** from **config.example.php** and fill in the database credentials.
- **“Database connection failed”**: Check host, database name, username, and password in **api/config.php**. On Hostinger, the host is often `localhost`; if not, use the host shown in the MySQL Databases section.
- **Pins don’t load / 404 on api/notes.php**: Check that **api/notes.php** is uploaded and that the path in **app.js** (API_BASE) matches your URL structure.
- **CORS errors**: The API sends `Access-Control-Allow-Origin: *`. If your frontend is on a different domain, ensure your Hostinger plan allows it or adjust CORS in **api/notes.php** if needed.
