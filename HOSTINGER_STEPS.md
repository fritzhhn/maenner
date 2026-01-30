# Step-by-step: Put the website on Hostinger with database

Do these steps in order. You have not uploaded the site yet.

---

## Step 1: Create the database on Hostinger

1. Log in to **Hostinger** → open **hPanel** (control panel).
2. Go to **Databases** → **MySQL Databases** (or **Create Database**).
3. Create a new database:
   - Click **Create new database** (or similar).
   - Choose a **database name** (e.g. `map_notes`; Hostinger may add a prefix like `u123456789_`).
   - Choose a **username** and a **password**. Save the password somewhere safe.
4. After it’s created, note down:
   - **Database name** (e.g. `u123456789_map_notes`)
   - **Username** (e.g. `u123456789_map_notes`)
   - **Password**
   - **Host** (often `localhost`; if you see something like `mysql123.hostinger.com`, use that).

---

## Step 2: Create the `notes` table (phpMyAdmin)

1. In hPanel, find **Databases** and open **phpMyAdmin** (link to manage your databases).
2. In the left sidebar, click your new database (the one you created in Step 1).
3. Click the **SQL** tab at the top.
4. Open the file **schema.sql** from this project on your computer. Copy its full content.
5. Paste that SQL into the phpMyAdmin SQL box.
6. Click **Go** (or **Run**).
7. You should see a success message and a new table **notes** in the left sidebar.

---

## Step 3: Create `api/config.php` on your computer

1. On your computer, open the project folder (the one with `index.html`, `app.js`, `api/`, etc.).
2. Go into the **api** folder.
3. Duplicate **config.example.php** and name the copy **config.php**.
4. Open **config.php** in a text editor and replace the placeholder values with your real database details from Step 1:

   - `host` → usually `localhost` (or the host from Step 1).
   - `dbname` → your full database name (e.g. `u123456789_map_notes`).
   - `username` → your database username.
   - `password` → your database password.

5. Save the file. Do **not** commit this file to Git (it’s already in `.gitignore`).

---

## Step 4: Upload the whole project to Hostinger

1. In hPanel, go to **Files** → **File Manager** (or **FTP** if you prefer).
2. Open **public_html** (this is the folder that becomes your website root, e.g. `https://yourdomain.com/`).
   - If you want the site at `https://yourdomain.com/maenner/`, create a folder **maenner** inside **public_html** and open that instead.
3. Upload **all** your project files into that folder so that you have:
   - **public_html/** (or **public_html/maenner/**)
     - `index.html`
     - `app.js`
     - `style.css`
     - `pin1.svg`, `pin2.svg`, `pin3.svg`
     - **api/**
       - `notes.php`
       - `config.php`  ← must be there (the one you created in Step 3)
       - `config.example.php` (optional)

4. Make sure **api/config.php** is really on the server (it contains the DB password; without it the API will show “Server config missing”).

---

## Step 5: Set the correct site URL (if needed)

- If the site is at the **root** of your domain (e.g. `https://yourdomain.com/`), you don’t need to change anything in the code.
- If the site is in a **subfolder** (e.g. `https://yourdomain.com/maenner/`), open **app.js** on the server (or edit locally and re-upload) and check the line with **API_BASE**. It should be:

  ```js
  const API_BASE = "api";
  ```

  So the app will request `api/notes.php` relative to the current page (e.g. `https://yourdomain.com/maenner/api/notes.php`). That is correct for a subfolder; no change needed unless you use a different structure.

---

## Step 6: Test the website

1. Open your site in the browser (e.g. `https://yourdomain.com/` or `https://yourdomain.com/maenner/`).
2. Wait for the map to load. Pins from the database should appear (at first there will be none).
3. Click on the map → place a pin → write a note → submit (e.g. “Save pin” / “+”).
4. The new pin should appear. Refresh the page: the pin should still be there (saved in the database).
5. Open the same URL in another browser or incognito (or on your phone): you should see the same pin. That means the database is shared for everyone.

---

## If something goes wrong

- **“Server config missing”**  
  → **api/config.php** is missing on the server or in the wrong place. Upload it (Step 3 and 4).

- **“Database connection failed”**  
  → Check **api/config.php**: host, database name, username, and password must match exactly what Hostinger shows for your MySQL database.

- **Pins don’t load / empty map**  
  → Open the browser’s Developer Tools (F12) → **Network** tab → reload the page. Check if a request to **notes.php** fails (e.g. 404 or 500).  
  - 404: **api/notes.php** not uploaded or wrong path.  
  - 500: usually wrong **config.php** or database not created / table not created (repeat Step 1 and 2).

- **New pin doesn’t save**  
  → Again check Network tab for the **POST** to **notes.php**. If it’s 500, check Hostinger error logs and **api/config.php**; also confirm the **notes** table exists in phpMyAdmin.

---

You’re done when: the site loads on Hostinger, you can add a pin, and after refresh (and on another device) the same pins appear.
