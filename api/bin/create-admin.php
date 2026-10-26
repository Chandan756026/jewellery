<?php
declare(strict_types=1);

/**
 * Creates (or resets the password of) an administrator. Credentials are never stored in code.
 *
 *   php api/bin/create-admin.php you@example.com "Your Name"            (asks for a password)
 *   php api/bin/create-admin.php you@example.com "Your Name" --generate (prints a random password once)
 */

if (PHP_SAPI !== 'cli') {
    exit('Run this script from the command line.');
}

require __DIR__ . '/../src/core.php';
require __DIR__ . '/../src/auth.php';

$args = array_values(array_filter($argv, fn ($a) => !str_starts_with($a, '--')));
$generate = in_array('--generate', $argv, true);
$email = mb_strtolower(trim($args[1] ?? ''));
$name = trim($args[2] ?? 'Administrator');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    exit("Usage: php api/bin/create-admin.php you@example.com \"Your Name\" [--generate]\n");
}

function prompt_hidden(string $label): string
{
    if (DIRECTORY_SEPARATOR === '\\') {
        $ps = 'powershell -NoProfile -Command "$s = Read-Host -AsSecureString \'' . $label . '\'; '
            . '[Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))"';
        $out = shell_exec($ps);
        if (is_string($out) && trim($out) !== '') {
            return trim($out);
        }
    } else {
        echo "$label: ";
        system('stty -echo');
        $v = trim((string) fgets(STDIN));
        system('stty echo');
        echo "\n";
        return $v;
    }
    echo "$label (input will be visible): ";
    return trim((string) fgets(STDIN));
}

if ($generate) {
    $password = bin2hex(random_bytes(6)) . 'A7';
} else {
    $password = prompt_hidden('Password (min 10 characters, letters and numbers)');
    if ($password !== prompt_hidden('Repeat password')) {
        exit("Passwords did not match.\n");
    }
}
if ($problem = password_problem($password)) {
    exit("Password rejected: $problem\n");
}

$now = now_utc();
$existing = q('SELECT id FROM users WHERE email = ?', [$email])->fetchColumn();
if ($existing !== false) {
    q('UPDATE users SET password = ?, role = \'admin\', is_active = 1, name = ?, updated_at = ? WHERE id = ?', [store_password($password), $name, $now, $existing]);
    echo "Updated existing administrator $email.\n";
} else {
    q('INSERT INTO users (name, email, password, role, is_active, created_at, updated_at) VALUES (?,?,?,\'admin\',1,?,?)',
        [$name, $email, store_password($password), $now, $now]);
    echo "Created administrator $email.\n";
}
if (plaintext_passwords_allowed()) {
    echo "NOTE: local development mode - the password was saved as plain text in users.password (ALLOW_PLAINTEXT_PASSWORDS=1).
";
}
if ($generate) {
    echo "Temporary password (shown once, change it after signing in): $password\n";
}
