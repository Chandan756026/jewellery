<?php
declare(strict_types=1);

/**
 * Offers and homepage popups.
 *
 * Stored `status` is only the admin's intent (draft | published). The effective `state` is always computed
 * from the stored status and the start/end times in UTC, so scheduled/expired handling is consistent everywhere:
 *   draft     – status is draft
 *   scheduled – published, starts in the future
 *   active    – published, started, not yet ended
 *   expired   – published, end time has passed
 */

function offer_state(array $o, ?string $now = null): string
{
    $now ??= now_utc();
    if ($o['status'] !== 'published') {
        return 'draft';
    }
    if ($o['starts_at'] > $now) {
        return 'scheduled';
    }
    if ($o['ends_at'] !== null && $o['ends_at'] <= $now) {
        return 'expired';
    }
    return 'active';
}

function offer_public(array $o): array
{
    return [
        'id' => (int) $o['id'],
        'campaign_id' => $o['campaign_id'],
        'title' => $o['title'],
        'description' => $o['description'],
        'discount_text' => $o['discount_text'],
        'coupon_code' => $o['coupon_code'],
        'image' => upload_url($o['image']),
        'mobile_image' => upload_url($o['mobile_image']),
        'button_text' => $o['button_text'],
        'button_url' => $o['button_url'],
        'starts_at' => iso($o['starts_at']),
        'ends_at' => iso($o['ends_at']),
        'popup_enabled' => (bool) $o['popup_enabled'],
        'popup_frequency' => $o['popup_frequency'],
        'display_priority' => (int) $o['display_priority'],
        'min_cart_value' => $o['min_cart_value'] === null ? null : (float) $o['min_cart_value'],
        'terms' => $o['terms'],
    ];
}

function offer_admin(array $o): array
{
    return offer_public($o) + [
        'image_path' => $o['image'],
        'mobile_image_path' => $o['mobile_image'],
        'status' => $o['status'],
        'state' => offer_state($o),
        'created_at' => iso($o['created_at']),
        'updated_at' => iso($o['updated_at']),
    ];
}

function offer_find(int $id): array
{
    $r = q('SELECT * FROM offers WHERE id = ?', [$id])->fetch();
    if (!$r) {
        fail(404, 'Offer not found.');
    }
    return $r;
}

function new_campaign_id(): string
{
    return 'cmp_' . bin2hex(random_bytes(6));
}

function offer_validate(array $in): array
{
    $v = new Validator($in);
    $d = [];
    $d['title'] = $v->string('title', true, 160);
    $d['description'] = $v->string('description', false, 1000, true);
    $d['discount_text'] = $v->string('discount_text', false, 60);
    $code = $v->string('coupon_code', false, 40);
    if ($code !== null && !preg_match('/^[A-Za-z0-9_\-]+$/', $code)) {
        $v->errors['coupon_code'] = 'Use letters, numbers, hyphens and underscores only.';
    }
    $d['coupon_code'] = $code !== null ? strtoupper($code) : null;
    $d['image'] = $v->imagePath('image');
    $d['mobile_image'] = $v->imagePath('mobile_image');
    $d['button_text'] = $v->string('button_text', false, 60);
    $d['button_url'] = $v->url('button_url');
    if ($d['button_text'] !== null && $d['button_url'] === null && !isset($v->errors['button_url'])) {
        $v->errors['button_url'] = 'Add a link for the button, or clear the button text.';
    }
    if ($d['button_url'] !== null && $d['button_text'] === null) {
        $v->errors['button_text'] = 'Add the text for the button.';
    }
    $d['starts_at'] = $v->datetime('starts_at', true);
    $d['ends_at'] = $v->datetime('ends_at', false);
    if ($d['starts_at'] && $d['ends_at'] && $d['ends_at'] <= $d['starts_at']) {
        $v->errors['ends_at'] = 'The end must be after the start.';
    }
    $d['status'] = $v->enum('status', ['draft', 'published'], 'draft');
    $d['popup_enabled'] = $v->bool('popup_enabled', true);
    $d['popup_frequency'] = $v->enum('popup_frequency', ['every_visit', 'session', 'daily', 'campaign'], 'session');
    $cid = $v->string('campaign_id', false, 40);
    if ($cid !== null && !preg_match('/^[A-Za-z0-9_\-]+$/', $cid)) {
        $v->errors['campaign_id'] = 'Use letters, numbers, hyphens and underscores only.';
    }
    $d['campaign_id'] = $cid;
    $d['display_priority'] = $v->int('display_priority', 0, 1000, 0);
    $d['min_cart_value'] = $v->decimal('min_cart_value', 0, 100000000);
    $d['terms'] = $v->string('terms', false, 2000, true);
    if ($d['status'] === 'published' && $d['popup_enabled'] && $d['title'] === null) {
        $v->errors['title'] = 'This field is required.';
    }
    $v->fail();
    return $d;
}

// ───────── Public API ─────────
route('GET', '/offers/active', function () {
    $now = now_utc();
    $rows = q(
        "SELECT * FROM offers WHERE status = 'published' AND starts_at <= ? AND (ends_at IS NULL OR ends_at > ?)
         ORDER BY display_priority DESC, starts_at DESC, id DESC LIMIT 12",
        [$now, $now]
    )->fetchAll();
    $popups = setting('popups_enabled', '1') === '1';
    return [
        'data' => array_map('offer_public', $rows),
        'popups_enabled' => $popups,
        'server_time' => iso($now),
    ];
});

// ───────── Admin API ─────────
route('GET', '/admin/offers', function () {
    [$page, $per, $offset] = paging();
    $now = now_utc();
    $where = ['1=1'];
    $args = [];
    $search = trim((string) ($_GET['search'] ?? ''));
    if ($search !== '') {
        $like = '%' . addcslashes($search, '%_\\') . '%';
        $where[] = '(title LIKE ? OR coupon_code LIKE ? OR discount_text LIKE ?)';
        array_push($args, $like, $like, $like);
    }
    $state = $_GET['state'] ?? '';
    $stateSql = [
        'draft' => "status = 'draft'",
        'scheduled' => "(status = 'published' AND starts_at > ?)",
        'active' => "(status = 'published' AND starts_at <= ? AND (ends_at IS NULL OR ends_at > ?))",
        'expired' => "(status = 'published' AND starts_at <= ? AND ends_at IS NOT NULL AND ends_at <= ?)",
    ];
    if (isset($stateSql[$state])) {
        $where[] = $stateSql[$state];
        $n = substr_count($stateSql[$state], '?');
        for ($i = 0; $i < $n; $i++) {
            $args[] = $now;
        }
    }
    $cond = implode(' AND ', $where);
    $total = (int) q("SELECT COUNT(*) FROM offers WHERE $cond", $args)->fetchColumn();
    $rows = q("SELECT * FROM offers WHERE $cond ORDER BY display_priority DESC, starts_at DESC, id DESC LIMIT $per OFFSET $offset", $args)->fetchAll();
    return ['data' => array_map('offer_admin', $rows), 'meta' => page_meta($page, $per, $total)];
}, 'user');

route('GET', '/admin/offers/{id:\d+}', fn (array $p) => ['data' => offer_admin(offer_find((int) $p['id']))], 'user');

route('POST', '/admin/offers', function () {
    $d = offer_validate(input());
    $now = now_utc();
    q(
        'INSERT INTO offers (title, description, discount_text, coupon_code, image, mobile_image, button_text, button_url, starts_at, ends_at, status,
            popup_enabled, popup_frequency, campaign_id, display_priority, min_cart_value, terms, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [$d['title'], $d['description'], $d['discount_text'], $d['coupon_code'], $d['image'], $d['mobile_image'], $d['button_text'], $d['button_url'],
         $d['starts_at'], $d['ends_at'], $d['status'], (int) $d['popup_enabled'], $d['popup_frequency'], $d['campaign_id'] ?? new_campaign_id(),
         $d['display_priority'], $d['min_cart_value'], $d['terms'], $now, $now]
    );
    respond(['data' => offer_admin(offer_find((int) db()->lastInsertId()))], 201);
}, 'user');

route('PATCH', '/admin/offers/{id:\d+}', function (array $p) {
    $id = (int) $p['id'];
    $cur = offer_find($id);
    $merged = array_merge([
        'title' => $cur['title'], 'description' => $cur['description'], 'discount_text' => $cur['discount_text'],
        'coupon_code' => $cur['coupon_code'], 'image' => $cur['image'], 'mobile_image' => $cur['mobile_image'],
        'button_text' => $cur['button_text'], 'button_url' => $cur['button_url'],
        'starts_at' => iso($cur['starts_at']), 'ends_at' => iso($cur['ends_at']), 'status' => $cur['status'],
        'popup_enabled' => (bool) $cur['popup_enabled'], 'popup_frequency' => $cur['popup_frequency'],
        'campaign_id' => $cur['campaign_id'], 'display_priority' => (int) $cur['display_priority'],
        'min_cart_value' => $cur['min_cart_value'], 'terms' => $cur['terms'],
    ], input());
    $d = offer_validate($merged);
    q(
        'UPDATE offers SET title=?, description=?, discount_text=?, coupon_code=?, image=?, mobile_image=?, button_text=?, button_url=?, starts_at=?, ends_at=?,
            status=?, popup_enabled=?, popup_frequency=?, campaign_id=?, display_priority=?, min_cart_value=?, terms=?, updated_at=? WHERE id=?',
        [$d['title'], $d['description'], $d['discount_text'], $d['coupon_code'], $d['image'], $d['mobile_image'], $d['button_text'], $d['button_url'],
         $d['starts_at'], $d['ends_at'], $d['status'], (int) $d['popup_enabled'], $d['popup_frequency'], $d['campaign_id'] ?? $cur['campaign_id'],
         $d['display_priority'], $d['min_cart_value'], $d['terms'], now_utc(), $id]
    );
    return ['data' => offer_admin(offer_find($id))];
}, 'user');

route('DELETE', '/admin/offers/{id:\d+}', function (array $p) {
    offer_find((int) $p['id']);
    q('DELETE FROM offers WHERE id = ?', [(int) $p['id']]);
    return ['ok' => true];
}, 'user');
