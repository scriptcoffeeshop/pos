package com.scriptcoffeeshop.pos;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "LanPrinter")
public class LanPrinterPlugin extends Plugin {

    @PluginMethod
    public void send(PluginCall call) {
        String host = call.getString("host");
        String payload = call.getString("payload");
        int port = call.getInt("port", 9100);
        int timeoutMs = call.getInt("timeoutMs", 4500);

        if (host == null || host.trim().isEmpty()) {
            call.reject("Printer host is required", "INVALID_HOST");
            return;
        }

        if (payload == null || payload.isEmpty()) {
            call.reject("Printer payload is required", "INVALID_PAYLOAD");
            return;
        }

        if (port <= 0 || port > 65535) {
            call.reject("Printer port must be between 1 and 65535", "INVALID_PORT");
            return;
        }

        execute(() -> {
            long startedAt = System.currentTimeMillis();

            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host.trim(), port), timeoutMs);
                socket.setSoTimeout(timeoutMs);

                byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
                OutputStream output = socket.getOutputStream();
                output.write(bytes);
                output.flush();
                socket.shutdownOutput();

                JSObject result = new JSObject();
                result.put("bytesWritten", bytes.length);
                result.put("elapsedMs", System.currentTimeMillis() - startedAt);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("LAN printer socket failed: " + error.getMessage(), "LAN_PRINT_FAILED", error);
            }
        });
    }
}
