package com.scriptcoffeeshop.pos;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
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

@CapacitorPlugin(
    name = "OnlineOrderNotifier",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class OnlineOrderNotifierPlugin extends Plugin {
    private static final String TAG = "OnlineOrderNotifier";
    private static final String CHANNEL_ID = "script_coffee_online_orders";
    private static final int NOTIFICATION_ID = 7107;
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
    private boolean appActive = true;
    private boolean acceptanceRequired = true;
    private boolean soundEnabled = true;
    private String notificationRepeatMode = "continuous";
    private int notificationVolume = 80;
    private int reminderMinutes = 5;
    private int pollIntervalMs = 20_000;
    private boolean backgroundServiceRequested = false;
    private String lastNotificationSignature = "";

    @Override
    public void load() {
        createNotificationChannel();
    }

    @PluginMethod
    public void configure(PluginCall call) {
        String nextApiBaseUrl = call.getString("apiBaseUrl", "");
        String nextAnonKey = call.getString("anonKey", "");
        String nextStationId = call.getString("stationId", "");
        String nextStationLabel = call.getString("stationLabel", "");

        synchronized (stateLock) {
            apiBaseUrl = sanitizeBaseUrl(nextApiBaseUrl);
            anonKey = nextAnonKey == null ? "" : nextAnonKey.trim();
            stationId = nextStationId == null ? "" : nextStationId.trim();
            stationLabel = nextStationLabel == null ? "" : nextStationLabel.trim();
            applySettings(call);
            configured = !apiBaseUrl.isEmpty() && !anonKey.isEmpty();
            if (configured) {
                ensureRequestExecutorLocked();
                syncBackgroundServiceLocked();
            } else {
                stopRequestExecutorLocked();
                stopBackgroundService();
            }
        }

        JSObject result = new JSObject();
        result.put("enabled", configured);
        result.put("notifications", notificationPermissionState());
        call.resolve(result);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put("notifications", "granted");
            call.resolve(result);
            return;
        }

        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("notifications", "granted");
            call.resolve(result);
            return;
        }

        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("notifications", notificationPermissionState());
        call.resolve(result);
    }

    @PluginMethod
    public void syncState(PluginCall call) {
        synchronized (stateLock) {
            applySettings(call);
            acceptedOrderIds.clear();
            acceptedOrderIds.addAll(readStringSet(call.getArray("acceptedOrderIds", new JSArray())));
            for (String orderId : acceptedOrderIds) {
                sharedReminderStatesByOrderId.put(orderId, ReminderStateSnapshot.seen(orderId));
            }
            activeOrders.clear();
            JSArray orders = call.getArray("activeOrders", new JSArray());
            for (int index = 0; index < orders.length(); index++) {
                JSONObject value = orders.optJSONObject(index);
                OrderSnapshot order = OrderSnapshot.fromJson(value);
                if (order != null && !acceptedOrderIds.contains(order.id)) {
                    activeOrders.put(order.id, order);
                }
            }

            Boolean nextAppActive = call.getBoolean("appActive", null);
            if (nextAppActive != null) {
                appActive = nextAppActive;
            }
            pruneSnoozesLocked(System.currentTimeMillis());
            maybeNotifyLocked();
            syncBackgroundServiceLocked();
        }
        call.resolve();
    }

    @PluginMethod
    public void snooze(PluginCall call) {
        long untilEpochMs = readLongOption(call, "untilEpochMs", System.currentTimeMillis() + 60_000);
        Set<String> orderIds = readStringSet(call.getArray("orderIds", new JSArray()));

        synchronized (stateLock) {
            for (String orderId : orderIds) {
                snoozedUntilByOrderId.put(orderId, untilEpochMs);
                sharedReminderStatesByOrderId.put(orderId, ReminderStateSnapshot.snoozed(orderId, untilEpochMs));
            }
            lastNotificationSignature = "";
            maybeNotifyLocked();
            applyLocalStateToBackgroundService("snooze", new ArrayList<>(orderIds), untilEpochMs);
        }
        postReminderStateActionAsync("snooze", orderIds, untilEpochMs);
        call.resolve();
    }

    @PluginMethod
    public void markSeen(PluginCall call) {
        Set<String> orderIds = readStringSet(call.getArray("orderIds", new JSArray()));
        synchronized (stateLock) {
            acceptedOrderIds.addAll(orderIds);
            for (String orderId : orderIds) {
                activeOrders.remove(orderId);
                snoozedUntilByOrderId.remove(orderId);
                sharedReminderStatesByOrderId.put(orderId, ReminderStateSnapshot.seen(orderId));
            }
            lastNotificationSignature = "";
            maybeNotifyLocked();
            applyLocalStateToBackgroundService("seen", new ArrayList<>(orderIds), 0L);
        }
        postReminderStateActionAsync("seen", orderIds, 0L);
        call.resolve();
    }

    @PluginMethod
    public void setAppActive(PluginCall call) {
        boolean nextAppActive = call.getBoolean("active", true);
        synchronized (stateLock) {
            appActive = nextAppActive;
            if (appActive) {
                cancelNotification();
            } else {
                maybeNotifyLocked();
            }
            syncBackgroundServiceLocked();
        }
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        synchronized (stateLock) {
            activeOrders.clear();
            snoozedUntilByOrderId.clear();
            sharedReminderStatesByOrderId.clear();
            lastNotificationSignature = "";
            cancelNotification();
            stopBackgroundService();
        }
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        synchronized (stateLock) {
            appActive = false;
            maybeNotifyLocked();
            syncBackgroundServiceLocked();
        }
    }

    @Override
    protected void handleOnResume() {
        synchronized (stateLock) {
            appActive = true;
            cancelNotification();
            stopBackgroundService();
        }
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (stateLock) {
            if (appActive || !configured) {
                stopBackgroundService();
            } else {
                syncBackgroundServiceLocked();
            }
            stopRequestExecutorLocked();
        }
    }

    private void applySettings(PluginCall call) {
        acceptanceRequired = call.getBoolean("acceptanceRequired", acceptanceRequired);
        soundEnabled = call.getBoolean("soundEnabled", soundEnabled);
        notificationRepeatMode = "once".equals(call.getString("notificationRepeatMode", notificationRepeatMode))
            ? "once"
            : "continuous";
        notificationVolume = clamp(call.getInt("notificationVolume", notificationVolume), 0, 100);
        reminderMinutes = clamp(call.getInt("reminderMinutes", reminderMinutes), 0, 120);
        pollIntervalMs = clamp(call.getInt("pollIntervalMs", pollIntervalMs), MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS);
    }

    private void ensureRequestExecutorLocked() {
        if (pollExecutor == null || pollExecutor.isShutdown()) {
            pollExecutor = Executors.newSingleThreadScheduledExecutor();
        }
    }

    private void startPollingLocked() {
        ensureRequestExecutorLocked();
        if (pollTask != null && !pollTask.isCancelled()) {
            return;
        }

        pollTask = pollExecutor.scheduleWithFixedDelay(this::pollOrdersSafely, 2_000, pollIntervalMs, TimeUnit.MILLISECONDS);
    }

    private void stopRequestExecutorLocked() {
        if (pollTask != null) {
            pollTask.cancel(true);
            pollTask = null;
        }
        if (pollExecutor != null) {
            pollExecutor.shutdownNow();
            pollExecutor = null;
        }
    }

    private void syncBackgroundServiceLocked() {
        if (!configured || appActive) {
            stopBackgroundService();
            return;
        }

        try {
            OnlineOrderPollingService.start(getContext(), new OnlineOrderPollingService.ServiceConfig(
                apiBaseUrl,
                anonKey,
                stationId,
                stationLabel,
                acceptanceRequired,
                reminderMinutes,
                soundEnabled,
                notificationRepeatMode,
                notificationVolume,
                pollIntervalMs
            ));
            backgroundServiceRequested = true;
        } catch (Exception error) {
            Log.w(TAG, "foreground service start failed: " + error.getClass().getSimpleName() + ": " + error.getMessage(), error);
            startPollingLocked();
        }
    }

    private void stopBackgroundService() {
        if (!backgroundServiceRequested) {
            return;
        }

        try {
            OnlineOrderPollingService.stop(getContext());
            backgroundServiceRequested = false;
        } catch (Exception error) {
            Log.w(TAG, "foreground service stop failed: " + error.getClass().getSimpleName() + ": " + error.getMessage(), error);
        }
    }

    private void applyLocalStateToBackgroundService(String action, List<String> orderIds, long untilEpochMs) {
        if (orderIds.isEmpty() || !backgroundServiceRequested) {
            return;
        }

        try {
            OnlineOrderPollingService.applyLocalState(getContext(), action, orderIds, untilEpochMs);
        } catch (Exception error) {
            Log.w(TAG, "foreground service local state sync failed: " + error.getClass().getSimpleName() + ": " + error.getMessage(), error);
        }
    }

    private void pollOrdersSafely() {
        String endpoint;
        String token;
        boolean shouldPoll;
        synchronized (stateLock) {
            shouldPoll = configured && !appActive;
            endpoint = apiBaseUrl;
            token = anonKey;
        }

        if (!shouldPoll) {
            return;
        }

        try {
            fetchAndApplyRuntimeSettings(endpoint, token);
            List<OrderSnapshot> nextOrders = fetchActiveOrders(endpoint, token);
            Map<String, ReminderStateSnapshot> nextReminderStates = fetchReminderStates(endpoint, token, nextOrders);
            synchronized (stateLock) {
                activeOrders.clear();
                sharedReminderStatesByOrderId.clear();
                sharedReminderStatesByOrderId.putAll(nextReminderStates);
                for (OrderSnapshot order : nextOrders) {
                    if (!isOrderSuppressedLocked(order, System.currentTimeMillis())) {
                        activeOrders.put(order.id, order);
                    }
                }
                pruneSnoozesLocked(System.currentTimeMillis());
                Log.d(TAG, "background poll activeOrders=" + activeOrders.size() + " fetched=" + nextOrders.size());
                maybeNotifyLocked();
            }
        } catch (Exception error) {
            Log.w(TAG, "background poll failed: " + error.getClass().getSimpleName() + ": " + error.getMessage(), error);
        }
    }

    private void fetchAndApplyRuntimeSettings(String endpoint, String token) {
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(endpoint + "/settings/runtime").openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(6_000);
            connection.setReadTimeout(6_000);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("apikey", token);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("User-Agent", "ScriptCoffeePOS-Android");
            connection.setRequestProperty("X-POS-STATION-ID", stationId);

            int statusCode = connection.getResponseCode();
            if (statusCode < 200 || statusCode >= 300) {
                return;
            }

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

            JSONObject onlineOrdering = new JSONObject(body.toString()).optJSONObject("onlineOrdering");
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
            // Runtime settings are also pushed through the WebView when the app is foregrounded.
        }
    }

    private List<OrderSnapshot> fetchActiveOrders(String endpoint, String token) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint + "/orders?limit=30").openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(6_000);
        connection.setReadTimeout(6_000);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("apikey", token);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("User-Agent", "ScriptCoffeePOS-Android");
        connection.setRequestProperty("X-POS-STATION-ID", stationId);

        int statusCode = connection.getResponseCode();
        if (statusCode < 200 || statusCode >= 300) {
            throw new IllegalStateException("orders request failed with " + statusCode);
        }

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

        JSONArray orders = new JSONObject(body.toString()).optJSONArray("orders");
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
        HttpURLConnection connection = (HttpURLConnection) new URL(
            endpoint + "/online-order-reminders/state?orderIds=" + encodedOrderIds
        ).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(6_000);
        connection.setReadTimeout(6_000);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("apikey", token);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("User-Agent", "ScriptCoffeePOS-Android");
        connection.setRequestProperty("X-POS-STATION-ID", stationId);

        int statusCode = connection.getResponseCode();
        if (statusCode < 200 || statusCode >= 300) {
            throw new IllegalStateException("reminder state request failed with " + statusCode);
        }

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

        JSONArray states = new JSONObject(body.toString()).optJSONArray("states");
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

    private void postReminderStateActionAsync(String action, Set<String> orderIds, long untilEpochMs) {
        if (orderIds.isEmpty()) {
            return;
        }

        String endpoint;
        String token;
        String currentStationId;
        ScheduledExecutorService executor;
        synchronized (stateLock) {
            if (!configured || apiBaseUrl.isEmpty() || anonKey.isEmpty()) {
                return;
            }
            endpoint = apiBaseUrl;
            token = anonKey;
            currentStationId = stationId;
            executor = pollExecutor;
        }

        if (executor == null || executor.isShutdown()) {
            return;
        }

        List<String> ids = new ArrayList<>(orderIds);
        executor.execute(() -> {
            try {
                postReminderStateAction(endpoint, token, currentStationId, action, ids, untilEpochMs);
            } catch (Exception ignored) {
                // The WebView foreground path writes the same shared state when available.
            }
        });
    }

    private void postReminderStateAction(
        String endpoint,
        String token,
        String currentStationId,
        String action,
        List<String> orderIds,
        long untilEpochMs
    ) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint + "/online-order-reminders/state").openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(6_000);
        connection.setReadTimeout(6_000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("apikey", token);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("User-Agent", "ScriptCoffeePOS-Android");
        connection.setRequestProperty("X-POS-STATION-ID", currentStationId);

        JSONObject body = new JSONObject();
        body.put("orderIds", new JSONArray(orderIds));
        body.put("action", action);
        body.put("stationId", currentStationId);
        if ("snooze".equals(action) && untilEpochMs > 0L) {
            body.put("snoozedUntil", formatIsoUtc(untilEpochMs));
        }

        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream stream = connection.getOutputStream()) {
            stream.write(payload);
        }

        int statusCode = connection.getResponseCode();
        connection.disconnect();
        if (statusCode < 200 || statusCode >= 300) {
            throw new IllegalStateException("reminder state update failed with " + statusCode);
        }
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
        if (appActive) {
            cancelNotification();
            return;
        }

        long now = System.currentTimeMillis();
        List<OrderSnapshot> visibleOrders = new ArrayList<>();
        for (OrderSnapshot order : activeOrders.values()) {
            if (!isOrderSuppressedLocked(order, now)) {
                visibleOrders.add(order);
            }
        }

        if (visibleOrders.isEmpty()) {
            lastNotificationSignature = "";
            cancelNotification();
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
        Log.d(TAG, "posting background notification signature=" + signature);
        postNotification(visibleOrders);
        if (soundEnabled && notificationVolume > 0) {
            playTone(notificationVolume);
        }
    }

    private void postNotification(List<OrderSnapshot> orders) {
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

        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.setAction("com.scriptcoffeeshop.pos.ONLINE_ORDER_NOTIFICATION");
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            getContext(),
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setOngoing(false)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setColor(0xFF0F766E)
            .setSilent(true);

        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, builder.build());
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

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "線上/掃碼新單提醒",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("POS 背景時提醒新線上與掃碼訂單");
        channel.setSound(null, null);

        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        manager.createNotificationChannel(channel);
    }

    private boolean canPostNotifications() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private void cancelNotification() {
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        manager.cancel(NOTIFICATION_ID);
    }

    private String notificationPermissionState() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return "granted";
        }
        return getPermissionState("notifications").toString();
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

    private static String formatIsoUtc(long epochMs) {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formatter.format(new Date(epochMs));
    }

    private static int clamp(Integer value, int minimum, int maximum) {
        int nextValue = value == null ? minimum : value;
        return Math.max(minimum, Math.min(maximum, nextValue));
    }

    private static long readLongOption(PluginCall call, String key, long fallback) {
        Double value = call.getDouble(key, null);
        if (value == null || !Double.isFinite(value)) {
            return fallback;
        }
        return Math.max(0L, value.longValue());
    }

    private static Set<String> readStringSet(JSArray values) {
        Set<String> result = new HashSet<>();
        if (values == null) {
            return result;
        }

        for (int index = 0; index < values.length(); index++) {
            String value = values.optString(index, "");
            if (!value.trim().isEmpty()) {
                result.add(value.trim());
            }
        }
        return result;
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

        static OrderSnapshot fromJson(JSONObject value) {
            if (value == null) {
                return null;
            }

            String id = value.optString("id", "").trim();
            if (id.isEmpty()) {
                return null;
            }

            return new OrderSnapshot(
                id,
                value.optString("source", ""),
                "new",
                "pending",
                value.optString("customerName", ""),
                "",
                value.optInt("subtotal", 0),
                parseCreatedAt(value.optString("createdAt", ""))
            );
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
                parseCreatedAt(value.optString("created_at", ""))
            );
        }

        private static String optNullableString(JSONObject value, String key) {
            if (!value.has(key) || value.isNull(key)) {
                return "";
            }
            return value.optString(key, "");
        }

        private static long parseCreatedAt(String createdAt) {
            if (createdAt == null || createdAt.trim().isEmpty()) {
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
                    Date date = formatter.parse(createdAt);
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
}
