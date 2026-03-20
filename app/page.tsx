"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import mapboxgl from "mapbox-gl";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface Device {
  device_id: string;
  lat: number;
  lng: number;
  altitude_baro: number | null;
  baseline_distance_cm: number | null;
  status: string;
  battery_v: number | null;
  last_seen: string | null;
}

interface Reading {
  id: number;
  device_id: string;
  lat: number | null;
  lng: number | null;
  distance_cm: number | null;
  water_detected: boolean;
  flood_depth_cm: number;
  battery_v: number | null;
  recorded_at: string;
}

export default function Home() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  // Only show devices with real data (last_seen in last 7 days, non-zero lat/lng or recent readings)
  const fetchDevices = useCallback(async () => {
    const { data } = await supabase
      .from("devices")
      .select("*")
      .order("device_id");
    if (data) {
      // Get devices that have recent readings (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: recentReadings } = await supabase
        .from("sensor_readings")
        .select("device_id, recorded_at")
        .gte("recorded_at", sevenDaysAgo)
        .order("recorded_at", { ascending: false });

      const recentDeviceIds = new Set(
        (recentReadings || []).map((r) => r.device_id)
      );

      // Show all devices but highlight ones with recent real data
      setDevices(data.filter((d) => recentDeviceIds.has(d.device_id)));
    }
  }, []);

  const fetchReadings = useCallback(async (deviceId: string) => {
    const { data } = await supabase
      .from("sensor_readings")
      .select("*")
      .eq("device_id", deviceId)
      .order("recorded_at", { ascending: false })
      .limit(50);
    if (data) setReadings(data);
  }, []);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 30000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  useEffect(() => {
    if (selected) fetchReadings(selected);
  }, [selected, fetchReadings]);

  // Auto-refresh readings every 15s
  useEffect(() => {
    if (!selected) return;
    const interval = setInterval(() => fetchReadings(selected), 15000);
    return () => clearInterval(interval);
  }, [selected, fetchReadings]);

  // Map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-80.12, 25.965],
      zoom: 14,
    });
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    devices.forEach((d) => {
      if (d.lat === 0 && d.lng === 0) return; // skip no-GPS devices

      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.background = d.device_id === selected ? "#3b82f6" : "#22c55e";
      el.style.border = "2px solid white";
      el.style.cursor = "pointer";
      el.onclick = () => setSelected(d.device_id);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([d.lng, d.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });

    // If selected device has coords, fly to it
    const sel = devices.find((d) => d.device_id === selected);
    if (sel && sel.lat !== 0 && sel.lng !== 0) {
      map.flyTo({ center: [sel.lng, sel.lat], zoom: 16 });
    }
  }, [devices, selected]);

  const selectedDevice = devices.find((d) => d.device_id === selected);
  const latestReading = readings[0];

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Map */}
      <div ref={mapContainer} style={{ flex: 1 }} />

      {/* Side Panel */}
      <div style={{ width: 380, background: "#111827", borderLeft: "1px solid #1f2937", overflow: "auto", padding: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#3b82f6", marginBottom: 4 }}>
          Flood Finder Test
        </h1>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 20 }}>
          Live sensor data from Supabase
        </p>

        {/* Device List */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, color: "#9ca3af", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
            Active Sensors ({devices.length})
          </h2>
          {devices.map((d) => (
            <div
              key={d.device_id}
              onClick={() => setSelected(d.device_id)}
              style={{
                padding: "10px 12px",
                marginBottom: 4,
                borderRadius: 8,
                cursor: "pointer",
                background: selected === d.device_id ? "#1e3a5f" : "#1f2937",
                border: selected === d.device_id ? "1px solid #3b82f6" : "1px solid transparent",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{d.device_id}</span>
                <span style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: d.status === "online" ? "#059669" + "22" : "#dc2626" + "22",
                  color: d.status === "online" ? "#34d399" : "#f87171",
                }}>
                  {d.status.toUpperCase()}
                </span>
              </div>
              {d.last_seen && (
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                  Last: {new Date(d.last_seen).toLocaleString()}
                </div>
              )}
            </div>
          ))}
          {devices.length === 0 && (
            <p style={{ fontSize: 13, color: "#4b5563" }}>No active sensors found</p>
          )}
        </div>

        {/* Selected Device Details */}
        {selectedDevice && (
          <div>
            <h2 style={{ fontSize: 13, color: "#9ca3af", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
              {selectedDevice.device_id} Details
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <InfoCard label="GPS Lat" value={selectedDevice.lat === 0 ? "No fix" : selectedDevice.lat.toFixed(6)} />
              <InfoCard label="GPS Lng" value={selectedDevice.lng === 0 ? "No fix" : selectedDevice.lng.toFixed(6)} />
              <InfoCard label="Baro Altitude" value={selectedDevice.altitude_baro != null ? `${selectedDevice.altitude_baro.toFixed(2)}m` : "—"} />
              <InfoCard label="Baseline" value={selectedDevice.baseline_distance_cm != null ? `${selectedDevice.baseline_distance_cm}cm` : "—"} />
              <InfoCard label="Battery" value={selectedDevice.battery_v != null ? `${selectedDevice.battery_v.toFixed(2)}V` : "—"} />
              <InfoCard label="Status" value={selectedDevice.status} color={selectedDevice.status === "online" ? "#34d399" : "#f87171"} />
            </div>

            {/* Latest Reading */}
            {latestReading && (
              <div style={{ background: "#1f2937", borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <h3 style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>LATEST READING</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 13 }}>
                  <div>Distance: <b>{latestReading.distance_cm}cm</b></div>
                  <div>Flood: <b style={{ color: latestReading.flood_depth_cm > 0 ? "#f87171" : "#34d399" }}>
                    {latestReading.flood_depth_cm}cm
                  </b></div>
                  <div>Water: <b>{latestReading.water_detected ? "YES" : "No"}</b></div>
                  <div>Battery: <b>{latestReading.battery_v?.toFixed(2)}V</b></div>
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                  {new Date(latestReading.recorded_at).toLocaleString()}
                </div>
              </div>
            )}

            {/* Reading History */}
            <h3 style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>READING HISTORY ({readings.length})</h3>
            <div style={{ maxHeight: 300, overflow: "auto" }}>
              {readings.map((r) => (
                <div key={r.id} style={{
                  padding: "8px 10px",
                  marginBottom: 2,
                  borderRadius: 6,
                  background: "#1f2937",
                  fontSize: 12,
                  display: "flex",
                  justifyContent: "space-between",
                }}>
                  <span style={{ color: "#9ca3af" }}>
                    {new Date(r.recorded_at).toLocaleTimeString()}
                  </span>
                  <span>
                    {r.distance_cm}cm
                    {r.flood_depth_cm > 0 && (
                      <span style={{ color: "#f87171", marginLeft: 8 }}>
                        flood: {r.flood_depth_cm}cm
                      </span>
                    )}
                  </span>
                  <span style={{ color: "#6b7280" }}>{r.battery_v?.toFixed(1)}V</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!selectedDevice && devices.length > 0 && (
          <p style={{ fontSize: 13, color: "#4b5563", textAlign: "center", marginTop: 40 }}>
            Click a sensor to view details
          </p>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "#1f2937", borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color || "#f3f4f6" }}>{value}</div>
    </div>
  );
}
