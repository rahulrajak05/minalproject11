# GlobalEdu XAMPP and MySQL setup

The frontend keeps its existing HTML, CSS, and JavaScript. PHP APIs in `php/` authenticate users, load catalog data, and save account data to MySQL. The browser never connects directly to MySQL.

## 1. Put the project under XAMPP

Install XAMPP, then copy the project folder (excluding `node_modules`) to:

```text
C:\xampp\htdocs\globaledu
```

Do not open `index.html` from File Explorer. Use the `http://localhost/` address so PHP and MySQL requests work.

## 2. Configure MySQL credentials

Copy the example configuration in PowerShell:

```powershell
Copy-Item C:\xampp\htdocs\globaledu\php\config.example.php C:\xampp\htdocs\globaledu\php\config.local.php
```

Edit `php/config.local.php` with your MySQL host, port, database name, username, and password. XAMPP's default local settings are shown in the example (`globaledu`, `root`, and an empty password). The local configuration file is excluded from Git. For a non-local deployment, use the `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` environment variables, and use a dedicated MySQL account rather than `root`.

For a local development account with a password, create the database user in phpMyAdmin's SQL tab (replace the example password):

```sql
CREATE USER 'globaledu_app'@'localhost' IDENTIFIED BY 'use-a-strong-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON globaledu.* TO 'globaledu_app'@'localhost';
```

Set `username` to `globaledu_app` and `password` to the chosen value in `php/config.local.php`. Import the database as a MySQL administrator; the application account does not need permission to create databases or tables.

## 3. Import the database through phpMyAdmin

1. Open the XAMPP Control Panel and start **Apache** and **MySQL**.
2. Visit [http://localhost/phpmyadmin](http://localhost/phpmyadmin).
3. Select **Import** in the top navigation.
4. Choose `C:\xampp\htdocs\globaledu\php\database\database.sql`.
5. Leave the format set to **SQL** and select **Import** / **Go**.
6. Confirm that the `globaledu` database and its catalog, user, and workspace tables are listed.

The SQL file creates the database and tables, relationships, indexes, and the catalog records used by the existing pages. It can be imported again without duplicating seed rows.

## 4. Run and verify the site

Open [http://localhost/globaledu/](http://localhost/globaledu/). Create an account on the Register page, then try the existing workspace features:

- Save a profile, favorite or compare a university, and mark checklist items.
- Change appearance and notification preferences.
- Add, edit, and delete a custom record on the Admin page.
- Subscribe using the footer newsletter form.
- Reload the page or open it in another browser to confirm account data is loaded from MySQL.

Sign-in, registration, and data changes are sent to `php/auth.php`, `php/insert.php`, `php/fetch.php`, `php/update.php`, and `php/delete.php`. Guest workspace data is stored in MySQL under the PHP session and moves into the account when the visitor registers or signs in. Passwords are stored as hashes; PHP uses PDO prepared statements and session cookies marked HttpOnly and SameSite=Lax. Use HTTPS in production.

If the APIs report a connection error, check the `php/config.local.php` credentials, that MySQL is running, and that XAMPP's `pdo_mysql` extension is enabled. The existing `server.js` is retained from the previous Node.js setup; it does not execute PHP. Use XAMPP for this integration.
