package za.co.brewbase.pos;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "BluetoothPrinter",
    permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH }, alias = "bluetooth"),
        @Permission(strings = { Manifest.permission.BLUETOOTH_ADMIN }, alias = "bluetoothAdmin"),
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location"),
    }
)
public class BluetoothPrinterPlugin extends Plugin {

    private static final String TAG = "BluetoothPrinter";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private BluetoothAdapter bluetoothAdapter;
    private BluetoothSocket bluetoothSocket;
    private OutputStream outputStream;
    private String connectedDeviceAddress = null;

    @Override
    public void load() {
        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
    }

    // Get list of already-paired Bluetooth devices
    @PluginMethod
    public void getPairedDevices(PluginCall call) {
        if (bluetoothAdapter == null) {
            call.reject("Bluetooth not supported on this device");
            return;
        }
        if (!bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth is not enabled");
            return;
        }

        try {
            Set<BluetoothDevice> pairedDevices = bluetoothAdapter.getBondedDevices();
            JSArray devices = new JSArray();

            for (BluetoothDevice device : pairedDevices) {
                JSObject d = new JSObject();
                d.put("name", device.getName() != null ? device.getName() : "Unknown");
                d.put("address", device.getAddress());
                devices.put(d);
            }

            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to get paired devices: " + e.getMessage());
        }
    }

    // Connect to a device by MAC address
    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address");
        if (address == null) {
            call.reject("No device address provided");
            return;
        }

        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth is not enabled");
            return;
        }

        // Disconnect existing if any
        disconnect(null);

        new Thread(() -> {
            try {
                BluetoothDevice device = bluetoothAdapter.getRemoteDevice(address);
                bluetoothSocket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                bluetoothAdapter.cancelDiscovery();
                bluetoothSocket.connect();
                outputStream = bluetoothSocket.getOutputStream();
                connectedDeviceAddress = address;

                JSObject result = new JSObject();
                result.put("connected", true);
                result.put("name", device.getName());
                call.resolve(result);
            } catch (IOException e) {
                Log.e(TAG, "Connection failed: " + e.getMessage());
                connectedDeviceAddress = null;
                call.reject("Connection failed: " + e.getMessage());
            }
        }).start();
    }

    // Print base64-encoded bytes
    @PluginMethod
    public void print(PluginCall call) {
        String dataBase64 = call.getString("data");
        if (dataBase64 == null) {
            call.reject("No data provided");
            return;
        }

        if (outputStream == null) {
            call.reject("Printer not connected");
            return;
        }

        new Thread(() -> {
            try {
                byte[] data = Base64.decode(dataBase64, Base64.DEFAULT);
                // Write in chunks
                int chunkSize = 512;
                for (int i = 0; i < data.length; i += chunkSize) {
                    int end = Math.min(i + chunkSize, data.length);
                    outputStream.write(data, i, end - i);
                    outputStream.flush();
                    Thread.sleep(50);
                }
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            } catch (IOException | InterruptedException e) {
                Log.e(TAG, "Print failed: " + e.getMessage());
                call.reject("Print failed: " + e.getMessage());
            }
        }).start();
    }

    // Disconnect
    @PluginMethod
    public void disconnect(PluginCall call) {
        try {
            if (outputStream != null) {
                outputStream.close();
                outputStream = null;
            }
            if (bluetoothSocket != null) {
                bluetoothSocket.close();
                bluetoothSocket = null;
            }
            connectedDeviceAddress = null;
        } catch (IOException e) {
            Log.e(TAG, "Disconnect error: " + e.getMessage());
        }
        if (call != null) {
            JSObject result = new JSObject();
            result.put("disconnected", true);
            call.resolve(result);
        }
    }

    // Check connection status
    @PluginMethod
    public void isConnected(PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", outputStream != null && connectedDeviceAddress != null);
        result.put("address", connectedDeviceAddress);
        call.resolve(result);
    }
}
