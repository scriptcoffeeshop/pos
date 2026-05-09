package com.scriptcoffeeshop.pos;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

public class OnlineOrderPollingService extends Service {
    static final String ACTION_START = "com.scriptcoffeeshop.pos.online_order_polling.START";
    static final String ACTION_STOP = "com.scriptcoffeeshop.pos.online_order_polling.STOP";
    static final String ACTION_APPLY_LOCAL_STATE = "com.scriptcoffeeshop.pos.online_order_polling.APPLY_LOCAL_STATE";

    static final String EXTRA_API_BASE_URL = "apiBaseUrl";
    static final String EXTRA_ANON_KEY = "anonKey";
    static final String EXTRA_STATION_ID = "stationId";
    static final String EXTRA_STATION_LABEL = "stationLabel";
    static final String EXTRA_ACCEPTANCE_REQUIRED = "acceptanceRequired";
    static final String EXTRA_REMINDER_MINUTES = "reminderMinutes";
    static final String EXTRA_SOUND_ENABLED = "soundEnabled";
    static final String EXTRA_NOTIFICATION_REPEAT_MODE = "notificationRepeatMode";
    static final String EXTRA_NOTIFICATION_VOLUME = "notificationVolume";
    static final String EXTRA_POLL_INTERVAL_MS = "pollIntervalMs";
    static final String EXTRA_ORDER_IDS = "orderIds";
    static final String EXTRA_ACTION = "action";
    static final String EXTRA_UNTIL_EPOCH_MS = "untilEpochMs";

    private static final String TAG = "OnlineOrderNotifier";
    private static final String PREFS_NAME = "online_order_polling_service";
    private static final String ALERT_CHANNEL_ID = "script_coffee_online_orders";
    private static final String SERVICE_CHANNEL_ID = "script_coffee_online_order_service";
    private static final int SERVICE_NOTIFICATION_ID = 7106;
    private static final int ALERT_NOTIFICATION_ID = 7107;
    private static final int MIN_POLL_INTERVAL_MS = 10_000;
    private static final int MAX_POLL_INTERVAL_MS = 120_000;

    private final Object stateLock = new Object();
    private final Map<String, OrderSnapshot> activeOrders = new HashMap<>();
    private final Map<String, Long> snoozedUntilByOrderId = new HashMap<>();
    private final Map<String, ReminderStateSnapshot> sharedReminderStatesByOrderId = new HashMap<>();
    private final Set<String> acceptedOrderIds = new HashSet<>();

    private ScheduledExecutorService pollExecutor;
    private ScheduledFuture<?> pollTask;
    private String apiBaseUrl = "";
    private String anonKey = "";
    private String stationId = "";
    private String stationLabel = "";
    private boolean configured = false;
    private boolean acceptanceRequired = true;
    private boolean soundEnabled = true;
    private String notificationRepeatMode = "continuous";
    private int notificationVolume = 80;
    private int reminderMinutes = 5;
    private int pollIntervalMs = 20_000;
    private String lastNotificationSignature = "";

    public static void start(Context context, ServiceConfig config) {
        Intent intent = new Intent(context, OnlineOrderPollingService.class);
        intent.setAction(ACTION_START);
        intent.putExtra(EXTRA_API_BASE_URL, config.apiBaseUrl);
        intent.putExtra(EXTRA_ANON_KEY, config.anonKey);
        intent.putExtra(EXTRA_STATION_ID, config.stationId);
        intent.putExtra(EXTRA_STATION_LABEL, config.stationLabel);
        intent.putExtra(EXTRA_ACCEPTANCE_REQUIRED, config.acceptanceRequired);
        intent.putExtra(EXTRA_REMINDER_MINUTES, config.reminderMinutes);
        intent.putExtra(EXTRA_SOUND_ENABLED, config.soundEnabled);
        intent.putExtra(EXTRA_NOTIFICATION_REPEAT_MODE, config.notificationRepeatMode);
        intent.putExtra(EXTRA_NOTIFICATION_VOLUME, config.notificationVolume);
        intent.putExtra(EXTRA_POLL_INTERVAL_MS, config.pollIntervalMs);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void stop(Context context) {
        Intent intent = new Intent(context, OnlineOrderPollingService.class);
        intent.setAction(ACTION_STOP);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void applyLocalState(Context context, String action, List<String> orderIds, long untilEpochMs) {
        Intent intent = new Intent(context, OnlineOrderPollingService.class);
        intent.setAction(ACTION_APPLY_LOCAL_STATE);
        intent.putExtra(EXTRA_ACTION, action);
        intent.putStringArrayListExtra(EXTRA_ORDER_IDS, new ArrayList<>(orderIds));
        intent.putExtra(EXTRA_UNTIL_EPOCH_MS, untilEpochMs);
        context.startService(intent);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();

        if (ACTION_STOP.equals(action)) {
            loadConfiguration();
            startForegroundService();
            stopPolling();
            stopForegroundService();
            return START_NOT_STICKY;
        }

        if (ACTION_APPLY_LOCAL_STATE.equals(action)) {
            applyLocalReminderState(intent);
            synchronized (stateLock) {
                if (pollTask == null) {
                    stopSelf(startId);
                    return START_NOT_STICKY;
                }
            }
            return START_STICKY;
        }

        if (intent == null || !applyConfiguration(intent)) {
            loadConfiguration();
        }

        synchronized (stateLock) {
            configured = !apiBaseUrl.isEmpty() && !anonKey.isEmpty();
        }

        if (!configured) {
            stopPolling();
            stopForegroundService();
            return START_NOT_STICKY;
        }

        persistConfiguration();
        startForegroundService();
        startPolling();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopPolling();
        cancelAlertNotification();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private boolean applyConfiguration(Intent intent) {
        if (intent == null) {
            return false;
        }

        String nextApiBaseUrl = intent.getStringExtra(EXTRA_API_BASE_URL);
        String nextAnonKey = intent.getStringExtra(EXTRA_ANON_KEY);
        if (nextApiBaseUrl == null && nextAnonKey == null) {
            return false;
        }

        synchronized (stateLock) {
            apiBaseUrl = sanitizeBaseUrl(nextApiBaseUrl);
            anonKey = nextAnonKey == null ? "" : nextAnonKey.trim();
            stationId = trim(intent.getStringExtra(EXTRA_STATION_ID));
            stationLabel = trim(intent.getStringExtra(EXTRA_STATION_LABEL));
            acceptanceRequired = intent.getBooleanExtra(EXTRA_ACCEPTANCE_REQUIRED, acceptanceRequired);
            reminderMinutes = clamp(intent.getIntExtra(EXTRA_REMINDER_MINUTES, reminderMinutes), 0, 120);
            soundEnabled = intent.getBooleanExtra(EXTRA_SOUND_ENABLED, soundEnabled);
            notificationRepeatMode = "once".equals(intent.getStringExtra(EXTRA_NOTIFICATION_REPEAT_MODE))
                ? "once"
                : "continuous";
            notificationVolume = clamp(intent.getIntExtra(EXTRA_NOTIFICATION_VOLUME, notificationVolume), 0, 100);
            pollIntervalMs = clamp(intent.getIntExtra(EXTRA_POLL_INTERVAL_MS, pollIntervalMs), MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS);
        }
        return true;
    }

    private void persistConfiguration() {
        SharedPreferences.Editor editor = getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit();
        synchronized (stateLock) {
            editor.putString(EXTRA_API_BASE_URL, apiBaseUrl);
            editor.putString(EXTRA_ANON_KEY, anonKey);
            editor.putString(EXTRA_STATION_ID, stationId);
            editor.putString(EXTRA_STATION_LABEL, stationLabel);
            editor.putBoolean(EXTRA_ACCEPTANCE_REQUIRED, acceptanceRequired);
            editor.putInt(EXTRA_REMINDER_MINUTES, reminderMinutes);
            editor.putBoolean(EXTRA_SOUND_ENABLED, soundEnabled);
            editor.putString(EXTRA_NOTIFICATION_REPEAT_MODE, notificationRepeatMode);
            editor.putInt(EXTRA_NOTIFICATION_VOLUME, notificationVolume);
            editor.putInt(EXTRA_POLL_INTERVAL_MS, pollIntervalMs);
        }
        editor.apply();
    }

    private void loadConfiguration() {
        SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        synchronized (stateLock) {
            apiBaseUrl = sanitizeBaseUrl(preferences.getString(EXTRA_API_BASE_URL, ""));
            anonKey = trim(preferences.getString(EXTRA_ANON_KEY, ""));
            stationId = trim(preferences.getString(EXTRA_STATION_ID, ""));
            stationLabel = trim(preferences.getString(EXTRA_STATION_LABEL, ""));
            acceptanceRequired = preferences.getBoolean(EXTRA_ACCEPTANCE_REQUIRED, acceptanceRequired);
            reminderMinutes = clamp(preferences.getInt(EXTRA_REMINDER_MINUTES, reminderMinutes), 0, 120);
            soundEnabled = preferences.getBoolean(EXTRA_SOUND_ENABLED, soundEnabled);
            notificationRepeatMode = "once".equals(preferences.getString(EXTRA_NOTIFICATION_REPEAT_MODE, notificationRepeatMode))
                ? "once"
                : "continuous";
            notificationVolume = clamp(preferences.getInt(EXTRA_NOTIFICATION_VOLUME, notificationVolume), 0, 100);
            pollIntervalMs = clamp(preferences.getInt(EXTRA_POLL_INTERVAL_MS, pollIntervalMs), MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS);
        }
    }

    private void startForegroundService() {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, SERVICE_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("POS 線上接單提醒執行中")
            .setContentText(serviceNotificationBody())
            .setContentIntent(contentPendingIntent())
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setColor(0xFF0F766E);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(SERVICE_NOTIFICATION_ID, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(SERVICE_NOTIFICATION_ID, builder.build());
        }
    }

    private String serviceNotificationBody() {
        String label;
        synchronized (stateLock) {
            label = stationLabel.isEmpty() ? stationId : stationLabel;
        }
        return label.isEmpty() ? "背景檢查線上/掃碼新單" : label + " · 背景檢查線上/掃碼新單";
    }

    private void stopForegroundService() {
        cancelAlertNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }

    private void startPolling() {
        synchronized (stateLock) {
            if (pollExecutor == null || pollExecutor.isShutdown()) {
                pollExecutor = Executors.newSingleThreadScheduledExecutor();
            }

            if (pollTask != null && !pollTask.isCancelled()) {
                return;
            }

            pollTask = pollExecutor.scheduleWithFixedDelay(this::pollOrdersSafely, 1_000, pollIntervalMs, TimeUnit.MILLISECONDS);
        }
    }

    private void stopPolling() {
        synchronized (stateLock) {
            if (pollTask != null) {
                pollTask.cancel(true);
                pollTask = null;
            }
            if (pollExecutor != null) {
                pollExecutor.shutdownNow();
                pollExecutor = null;
            }
            activeOrders.clear();
            snoozedUntilByOrderId.clear();
            sharedReminderStatesByOrderId.clear();
            lastNotificationSignature = "";
        }
    }

    private void applyLocalReminderState(@Nullable Intent intent) {
        if (intent == null) {
            return;
        }

        String action = intent.getStringExtra(EXTRA_ACTION);
        ArrayList<String> orderIds = intent.getStringArrayListExtra(EXTRA_ORDER_IDS);
        long untilEpochMs = intent.getLongExtra(EXTRA_UNTIL_EPOCH_MS, 0L);
        if (orderIds == null || orderIds.isEmpty()) {
            return;
        }

        synchronized (stateLock) {
            for (String orderId : orderIds) {
                if (orderId == null || orderId.trim().isEmpty()) {
                    continue;
                }
                String trimmedOrderId = orderId.trim();
                if ("snooze".equals(action)) {
                    snoozedUntilByOrderId.put(trimmedOrderId, untilEpochMs);
                    sharedReminderStatesByOrderId.put(trimmedOrderId, ReminderStateSnapshot.snoozed(trimmedOrderId, untilEpochMs));
                } else {
                    acceptedOrderIds.add(trimmedOrderId);
                    activeOrders.remove(trimmedOrderId);
                    snoozedUntilByOrderId.remove(trimmedOrderId);
                    sharedReminderStatesByOrderId.put(trimmedOrderId, ReminderStateSnapshot.seen(trimmedOrderId));
                }
            }
            lastNotificationSignature = "";
            maybeNotifyLocked();
        }
    }

    private void pollOrdersSafely() {
        String endpoint;
        String token;
        synchronized (stateLock) {
            if (!configured) {
                return;
            }
            endpoint = apiBaseUrl;
            token = anonKey;
        }

        try {
            fetchAndApplyRuntimeSettings(endpoint, token);
            List<OrderSnapshot> nextOrders = fetchActiveOrders(endpoint, token);
            Map<String, ReminderStateSnapshot> nextReminderStates = fetchReminderStates(endpoint, token, nextOrders);
            long now = System.currentTimeMillis();
            synchronized (stateLock) {
                activeOrders.clear();
                sharedReminderStatesByOrderId.clear();
                sharedReminderStatesByOrderId.putAll(nextReminderStates);
                for (OrderSnapshot order : nextOrders) {
                    if (!isOrderSuppressedLocked(order, now)) {
                        activeOrders.put(order.id, order);
                    }
                }
                pruneSnoozesLocked(now);
                Log.d(TAG, "foreground service poll activeOrders=" + activeOrders.size() + " fetched=" + nextOrders.size());
                maybeNotifyLocked();
            }
        } catch (Exception error) {
            Log.w(TAG, "foreground service poll failed: " + error.getClass().getSimpleName() + ": " + error.getMessage(), error);
        }
    }

    private void fetchAndApplyRuntimeSettings(String endpoint, String token) {
        try {
            HttpURLConnection connection = openJsonConnection(endpoint + "/settings/runtime", token, "GET");
            int statusCode = connection.getResponseCode();
            if (statusCode < 200 || statusCode >= 300) {
                connection.disconnect();
                return;
            }

            JSONObject onlineOrdering = new JSONObject(readResponseBody(connection)).optJSONObject("onlineOrdering");
            if (onlineOrdering == null) {
                return;
            }

            synchronized (stateLock) {
                acceptanceRequired = onlineOrdering.optBoolean("acceptanceRequired", acceptanceRequired);
                soundEnabled = onlineOrdering.optBoolean("soundEnabled", soundEnabled);
                reminderMinutes = clamp(onlineOrdering.optInt("unconfirmedReminderMinutes", reminderMinutes), 0, 120);
                notificationRepeatMode = "once".equals(onlineOrdering.optString("notificationRepeatMode", notificationRepeatMode))
                    ? "once"
                    : "continuous";
                notificationVolume = clamp(onlineOrdering.optInt("notificationVolume", notificationVolume), 0, 100);
            }
        } catch (Exception ignored) {
            // The next successful poll or foreground WebView sync will apply runtime changes.
        }
    }

    private List<OrderSnapshot> fetchActiveOrders(String endpoint, String token) throws Exception {
        HttpURLConnection connection = openJsonConnection(endpoint + "/orders?limit=30", token, "GET");
        int statusCode = connection.getResponseCode();
        if (statusCode < 200 || statusCode >= 300) {
            connection.disconnect();
            throw new IllegalStateException("orders request failed with " + statusCode);
        }

        JSONArray orders = new JSONObject(readResponseBody(connection)).optJSONArray("orders");
        if (orders == null) {
            return Collections.emptyList();
        }

        long now = System.currentTimeMillis();
        List<OrderSnapshot> active = new ArrayList<>();
        for (int index = 0; index < orders.length(); index++) {
            OrderSnapshot order = OrderSnapshot.fromApiJson(orders.optJSONObject(index));
            if (order != null && shouldRemind(order, now)) {
                active.add(order);
            }
        }
        return active;
    }

    private Map<String, ReminderStateSnapshot> fetchReminderStates(
        String endpoint,
        String token,
        List<OrderSnapshot> orders
    ) throws Exception {
        if (orders.isEmpty()) {
            return Collections.emptyMap();
        }

        List<String> orderIds = new ArrayList<>();
        for (OrderSnapshot order : orders) {
            orderIds.add(order.id);
        }
        String encodedOrderIds = URLEncoder.encode(String.join(",", orderIds), StandardCharsets.UTF_8.name());
        HttpURLConnection connection = openJsonConnection(
            endpoint + "/online-order-reminders/state?orderIds=" + encodedOrderIds,
            token,
            "GET"
        );
        int statusCode = connection.getResponseCode();
        if (statusCode < 200 || statusCode >= 300) {
            connection.disconnect();
            throw new IllegalStateException("reminder state request failed with " + statusCode);
        }

        JSONArray states = new JSONObject(readResponseBody(connection)).optJSONArray("states");
        if (states == null) {
            return Collections.emptyMap();
        }

        Map<String, ReminderStateSnapshot> result = new HashMap<>();
        for (int index = 0; index < states.length(); index++) {
            ReminderStateSnapshot state = ReminderStateSnapshot.fromApiJson(states.optJSONObject(index));
            if (state != null) {
                result.put(state.orderId, state);
            }
        }
        return result;
    }

    private HttpURLConnection openJsonConnection(String url, String token, String method) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(6_000);
        connection.setReadTimeout(6_000);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("apikey", token);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("User-Agent", "ScriptCoffeePOS-Android");
        connection.setRequestProperty("X-POS-STATION-ID", stationId);
        return connection;
    }

    private String readResponseBody(HttpURLConnection connection) throws Exception {
        StringBuilder body = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) {
                body.append(line);
            }
        } finally {
            connection.disconnect();
        }
        return body.toString();
    }

    private boolean shouldRemind(OrderSnapshot order, long now) {
        if (!("online".equals(order.source) || "qr".equals(order.source))) {
            return false;
        }
        if (!"new".equals(order.status)) {
            return false;
        }
        if (!("pending".equals(order.paymentStatus) || "authorized".equals(order.paymentStatus) || "paid".equals(order.paymentStatus))) {
            return false;
        }
        if (acceptedOrderIds.contains(order.id)) {
            return false;
        }
        if (acceptanceRequired) {
            return order.claimedBy.isEmpty();
        }
        return now - order.createdAtEpochMs >= reminderMinutes * 60_000L;
    }

    private boolean isOrderSuppressedLocked(OrderSnapshot order, long now) {
        if (acceptedOrderIds.contains(order.id)) {
            return true;
        }

        ReminderStateSnapshot sharedState = sharedReminderStatesByOrderId.get(order.id);
        if (sharedState != null && sharedState.isSuppressed(now)) {
            return true;
        }

        Long snoozedUntil = snoozedUntilByOrderId.get(order.id);
        return snoozedUntil != null && snoozedUntil > now;
    }

    private void maybeNotifyLocked() {
        long now = System.currentTimeMillis();
        List<OrderSnapshot> visibleOrders = new ArrayList<>();
        for (OrderSnapshot order : activeOrders.values()) {
            if (!isOrderSuppressedLocked(order, now)) {
                visibleOrders.add(order);
            }
        }

        if (visibleOrders.isEmpty()) {
            lastNotificationSignature = "";
            cancelAlertNotification();
            return;
        }

        Collections.sort(visibleOrders, (left, right) -> left.id.compareTo(right.id));
        List<String> ids = new ArrayList<>();
        for (OrderSnapshot order : visibleOrders) {
            ids.add(order.id);
        }

        String signature = String.join("|", ids);
        if ("continuous".equals(notificationRepeatMode)) {
            signature = signature + ":" + (now / 60_000L);
        }

        if (signature.equals(lastNotificationSignature)) {
            return;
        }

        lastNotificationSignature = signature;
        Log.d(TAG, "posting foreground service notification signature=" + signature);
        postAlertNotification(visibleOrders);
        if (soundEnabled && notificationVolume > 0) {
            playTone(notificationVolume);
        }
    }

    private void postAlertNotification(List<OrderSnapshot> orders) {
        if (!canPostNotifications()) {
            Log.w(TAG, "notification permission not granted");
            return;
        }

        OrderSnapshot firstOrder = orders.get(0);
        String title = String.format(Locale.TAIWAN, "%d 張線上/掃碼新單待接單", orders.size());
        String body = String.format(
            Locale.TAIWAN,
            "%s · %s · $%d",
            firstOrder.id,
            firstOrder.customerName.isEmpty() ? "線上顧客" : firstOrder.customerName,
            firstOrder.subtotal
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentPendingIntent())
            .setAutoCancel(true)
            .setOngoing(false)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setColor(0xFF0F766E)
            .setSilent(true);

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(ALERT_NOTIFICATION_ID, builder.build());
    }

    private PendingIntent contentPendingIntent() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction("com.scriptcoffeeshop.pos.ONLINE_ORDER_NOTIFICATION");
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void playTone(int volume) {
        try {
            final ToneGenerator toneGenerator = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, volume);
            Handler handler = new Handler(Looper.getMainLooper());
            toneGenerator.startTone(ToneGenerator.TONE_PROP_BEEP, 140);
            handler.postDelayed(() -> {
                toneGenerator.startTone(ToneGenerator.TONE_PROP_ACK, 160);
            }, 190);
            handler.postDelayed(toneGenerator::release, 450);
        } catch (Exception ignored) {
            // The notification remains visible even if a device blocks app-generated tones.
        }
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationChannel alertChannel = new NotificationChannel(
            ALERT_CHANNEL_ID,
            "線上/掃碼新單提醒",
            NotificationManager.IMPORTANCE_HIGH
        );
        alertChannel.setDescription("POS 背景時提醒新線上與掃碼訂單");
        alertChannel.setSound(null, null);

        NotificationChannel serviceChannel = new NotificationChannel(
            SERVICE_CHANNEL_ID,
            "POS 背景接單服務",
            NotificationManager.IMPORTANCE_LOW
        );
        serviceChannel.setDescription("維持 POS 背景檢查線上與掃碼新單");
        serviceChannel.setSound(null, null);

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.createNotificationChannel(alertChannel);
        manager.createNotificationChannel(serviceChannel);
    }

    private boolean canPostNotifications() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private void cancelAlertNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.cancel(ALERT_NOTIFICATION_ID);
    }

    private void pruneSnoozesLocked(long now) {
        List<String> expiredIds = new ArrayList<>();
        for (Map.Entry<String, Long> entry : snoozedUntilByOrderId.entrySet()) {
            if (entry.getValue() <= now || !activeOrders.containsKey(entry.getKey())) {
                expiredIds.add(entry.getKey());
            }
        }
        for (String orderId : expiredIds) {
            snoozedUntilByOrderId.remove(orderId);
        }

        List<String> staleSharedStateIds = new ArrayList<>();
        for (String orderId : sharedReminderStatesByOrderId.keySet()) {
            if (!activeOrders.containsKey(orderId) && !acceptedOrderIds.contains(orderId)) {
                staleSharedStateIds.add(orderId);
            }
        }
        for (String orderId : staleSharedStateIds) {
            sharedReminderStatesByOrderId.remove(orderId);
        }
    }

    private static String sanitizeBaseUrl(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().replaceAll("/+$", "");
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private static int clamp(int value, int minimum, int maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    static class ServiceConfig {
        final String apiBaseUrl;
        final String anonKey;
        final String stationId;
        final String stationLabel;
        final boolean acceptanceRequired;
        final int reminderMinutes;
        final boolean soundEnabled;
        final String notificationRepeatMode;
        final int notificationVolume;
        final int pollIntervalMs;

        ServiceConfig(
            String apiBaseUrl,
            String anonKey,
            String stationId,
            String stationLabel,
            boolean acceptanceRequired,
            int reminderMinutes,
            boolean soundEnabled,
            String notificationRepeatMode,
            int notificationVolume,
            int pollIntervalMs
        ) {
            this.apiBaseUrl = apiBaseUrl;
            this.anonKey = anonKey;
            this.stationId = stationId;
            this.stationLabel = stationLabel;
            this.acceptanceRequired = acceptanceRequired;
            this.reminderMinutes = reminderMinutes;
            this.soundEnabled = soundEnabled;
            this.notificationRepeatMode = notificationRepeatMode;
            this.notificationVolume = notificationVolume;
            this.pollIntervalMs = pollIntervalMs;
        }
    }

    private static class ReminderStateSnapshot {
        final String orderId;
        final String status;
        final long snoozedUntilEpochMs;

        ReminderStateSnapshot(String orderId, String status, long snoozedUntilEpochMs) {
            this.orderId = orderId;
            this.status = status;
            this.snoozedUntilEpochMs = snoozedUntilEpochMs;
        }

        static ReminderStateSnapshot seen(String orderId) {
            return new ReminderStateSnapshot(orderId, "seen", 0L);
        }

        static ReminderStateSnapshot snoozed(String orderId, long snoozedUntilEpochMs) {
            return new ReminderStateSnapshot(orderId, "snoozed", snoozedUntilEpochMs);
        }

        static ReminderStateSnapshot fromApiJson(JSONObject value) {
            if (value == null) {
                return null;
            }

            String orderNumber = value.optString("order_number", "").trim();
            if (orderNumber.isEmpty()) {
                return null;
            }

            return new ReminderStateSnapshot(
                orderNumber,
                value.optString("status", ""),
                parseIsoTimestamp(value.optString("snoozed_until", ""))
            );
        }

        boolean isSuppressed(long now) {
            if ("seen".equals(status)) {
                return true;
            }

            return "snoozed".equals(status) && snoozedUntilEpochMs > now;
        }
    }

    private static class OrderSnapshot {
        final String id;
        final String source;
        final String status;
        final String paymentStatus;
        final String customerName;
        final String claimedBy;
        final int subtotal;
        final long createdAtEpochMs;

        OrderSnapshot(
            String id,
            String source,
            String status,
            String paymentStatus,
            String customerName,
            String claimedBy,
            int subtotal,
            long createdAtEpochMs
        ) {
            this.id = id;
            this.source = source;
            this.status = status;
            this.paymentStatus = paymentStatus;
            this.customerName = customerName;
            this.claimedBy = claimedBy;
            this.subtotal = subtotal;
            this.createdAtEpochMs = createdAtEpochMs;
        }

        static OrderSnapshot fromApiJson(JSONObject value) {
            if (value == null) {
                return null;
            }

            String orderNumber = value.optString("order_number", "").trim();
            if (orderNumber.isEmpty()) {
                return null;
            }

            return new OrderSnapshot(
                orderNumber,
                value.optString("source", ""),
                value.optString("status", ""),
                value.optString("payment_status", ""),
                optNullableString(value, "customer_name"),
                optNullableString(value, "claimed_by"),
                value.optInt("subtotal", 0),
                parseIsoTimestamp(value.optString("created_at", ""))
            );
        }

        private static String optNullableString(JSONObject value, String key) {
            if (!value.has(key) || value.isNull(key)) {
                return "";
            }
            return value.optString(key, "");
        }
    }

    private static long parseIsoTimestamp(String value) {
        if (value == null || value.trim().isEmpty() || "null".equals(value)) {
            return 0L;
        }

        String[] patterns = {
            "yyyy-MM-dd'T'HH:mm:ss.SSSX",
            "yyyy-MM-dd'T'HH:mm:ssX"
        };
        for (String pattern : patterns) {
            try {
                SimpleDateFormat formatter = new SimpleDateFormat(pattern, Locale.US);
                formatter.setLenient(false);
                Date date = formatter.parse(value);
                if (date != null) {
                    return date.getTime();
                }
            } catch (Exception ignored) {
                // Try the next ISO timestamp shape.
            }
        }
        return 0L;
    }
}
