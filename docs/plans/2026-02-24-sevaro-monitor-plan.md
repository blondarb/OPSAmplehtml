# Sevaro Monitor iOS App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone iOS app that reads Apple Watch biometric data via HealthKit, aggregates daily, and uploads to the existing Sevaro Clinical Supabase backend for AI-powered anomaly detection.

**Architecture:** SwiftUI app with 3 screens (Setup, Dashboard, Settings). HealthKit reads Watch data synced to iPhone. CoreMotion for on-demand tremor sessions. Supabase Swift SDK for uploads. BGAppRefreshTask for daily background sync. No Watch companion app in Phase 1.

**Tech Stack:** Swift 5.9+ / SwiftUI / iOS 17+ / HealthKit / CoreMotion / Supabase Swift SDK / BackgroundTasks framework

**Design Doc:** `docs/plans/2026-02-24-sevaro-monitor-ios-design.md`

**Target Supabase:** outpatient_synapse (`czspsioerfaktnnrnmcw`) — same project powering Sevaro Clinical dashboard

**Device:** iPhone 16 Pro (device ID `00008140-0000146C0A53001C`, CoreDevice UUID `4A7995D3-2659-5A11-9BB3-08A43D34FDA7`)

---

## Task 1: Scaffold Xcode Project

**Files:**
- Create: `/Users/stevearbogast/dev/repos/SevaroMonitor/` (new directory)
- Create: Xcode project via `xcodebuild` or Xcode template

**Step 1: Create the project directory**

```bash
mkdir -p /Users/stevearbogast/dev/repos/SevaroMonitor
```

**Step 2: Initialize git repo**

```bash
cd /Users/stevearbogast/dev/repos/SevaroMonitor
git init
```

**Step 3: Create Xcode project**

Create a new SwiftUI App project in Xcode at `/Users/stevearbogast/dev/repos/SevaroMonitor/`:
- Product Name: `SevaroMonitor`
- Bundle ID: `com.sevaro.monitor`
- Team: `92YUSSM83T`
- Interface: SwiftUI
- Language: Swift
- Minimum Deployment: iOS 17.0

If creating programmatically, generate the project structure manually with the files below.

**Step 4: Add HealthKit capability**

Create `SevaroMonitor/SevaroMonitor.entitlements`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.developer.healthkit</key>
    <true/>
    <key>com.apple.developer.healthkit.background-delivery</key>
    <true/>
</dict>
</plist>
```

**Step 5: Add Info.plist usage descriptions**

Add to Info.plist (or project settings):
```xml
<key>NSHealthShareUsageDescription</key>
<string>Sevaro Monitor reads your Apple Watch health data to track biometric trends for your care team.</string>
<key>NSHealthUpdateUsageDescription</key>
<string>Sevaro Monitor saves health analysis results to Apple Health.</string>
<key>NSMotionUsageDescription</key>
<string>Sevaro Monitor uses motion sensors to assess tremor and gait patterns.</string>
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
    <string>com.sevaro.monitor.daily-sync</string>
</array>
```

**Step 6: Add Supabase Swift SDK via SPM**

Add package dependency:
- URL: `https://github.com/supabase/supabase-swift`
- Version: latest stable (2.x)
- Product: `Supabase`

**Step 7: Verify project builds**

```bash
xcodebuild -project SevaroMonitor.xcodeproj \
  -scheme SevaroMonitor \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  build 2>&1 | tail -5
```
Expected: `BUILD SUCCEEDED`

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold SevaroMonitor Xcode project with HealthKit + Supabase"
```

---

## Task 2: Data Models

**Files:**
- Create: `SevaroMonitor/Models/WearableModels.swift`
- Create: `SevaroMonitor/Models/AppState.swift`

**Step 1: Create WearableModels.swift**

These models match the existing Supabase `wearable_*` tables exactly, using `Codable` for direct Supabase SDK serialization:

```swift
import Foundation

// MARK: - Patient Record (matches wearable_patients table)

struct WearablePatient: Codable, Identifiable {
    let id: UUID
    let createdAt: Date?
    let name: String
    let age: Int
    let sex: String
    let primaryDiagnosis: String
    let medications: [PatientMedication]
    let wearableDevices: [PatientDevice]
    var baselineMetrics: BaselineMetrics
    let monitoringStartDate: String

    enum CodingKeys: String, CodingKey {
        case id
        case createdAt = "created_at"
        case name, age, sex
        case primaryDiagnosis = "primary_diagnosis"
        case medications
        case wearableDevices = "wearable_devices"
        case baselineMetrics = "baseline_metrics"
        case monitoringStartDate = "monitoring_start_date"
    }
}

struct PatientMedication: Codable {
    let name: String
    let dose: String?
    let frequency: String?
}

struct PatientDevice: Codable {
    let name: String
    let status: String?
    let dataTypes: [String]?

    enum CodingKeys: String, CodingKey {
        case name, status
        case dataTypes = "data_types"
    }
}

// MARK: - Baseline Metrics

struct BaselineMetrics: Codable {
    var restingHr: Double
    var hrvRmssd: Double
    var avgSteps: Double
    var sleepHours: Double
    var sleepEfficiency: Double
    var tremorPct: Double?

    enum CodingKeys: String, CodingKey {
        case restingHr = "resting_hr"
        case hrvRmssd = "hrv_rmssd"
        case avgSteps = "avg_steps"
        case sleepHours = "sleep_hours"
        case sleepEfficiency = "sleep_efficiency"
        case tremorPct = "tremor_pct"
    }
}

// MARK: - Daily Summary (matches wearable_daily_summaries table)

struct DailySummaryUpload: Codable {
    let patientId: UUID
    let date: String
    let metrics: DailyMetrics
    let overallStatus: String

    enum CodingKeys: String, CodingKey {
        case patientId = "patient_id"
        case date, metrics
        case overallStatus = "overall_status"
    }
}

struct DailyMetrics: Codable {
    var avgHr: Double
    var restingHr: Double
    var hrvRmssd: Double
    var hrv7dayAvg: Double?
    var spo2Avg: Double?
    var spo2Min: Double?
    var dailySteps: Int
    var activeCalories: Double?
    var sleepHours: Double
    var sleepEfficiency: Double
    var awakenings: Int?
    var tremorPct: Double?
    var dyskineticMins: Double?

    enum CodingKeys: String, CodingKey {
        case avgHr = "avg_hr"
        case restingHr = "resting_hr"
        case hrvRmssd = "hrv_rmssd"
        case hrv7dayAvg = "hrv_7day_avg"
        case spo2Avg = "spo2_avg"
        case spo2Min = "spo2_min"
        case dailySteps = "daily_steps"
        case activeCalories = "active_calories"
        case sleepHours = "sleep_hours"
        case sleepEfficiency = "sleep_efficiency"
        case awakenings
        case tremorPct = "tremor_pct"
        case dyskineticMins = "dyskinetic_mins"
    }
}

// MARK: - New Patient Creation

struct NewPatient: Codable {
    let name: String
    let age: Int
    let sex: String
    let primaryDiagnosis: String
    let medications: [PatientMedication]
    let wearableDevices: [PatientDevice]
    let baselineMetrics: BaselineMetrics
    let monitoringStartDate: String

    enum CodingKeys: String, CodingKey {
        case name, age, sex
        case primaryDiagnosis = "primary_diagnosis"
        case medications
        case wearableDevices = "wearable_devices"
        case baselineMetrics = "baseline_metrics"
        case monitoringStartDate = "monitoring_start_date"
    }
}
```

**Step 2: Create AppState.swift**

```swift
import Foundation
import SwiftUI

@MainActor
class AppState: ObservableObject {
    @Published var isOnboarded: Bool
    @Published var patientId: UUID?
    @Published var lastSyncDate: Date?
    @Published var syncInProgress = false
    @Published var syncError: String?

    private let defaults = UserDefaults.standard

    init() {
        self.isOnboarded = defaults.bool(forKey: "isOnboarded")
        if let idString = defaults.string(forKey: "patientId"),
           let id = UUID(uuidString: idString) {
            self.patientId = id
        }
        self.lastSyncDate = defaults.object(forKey: "lastSyncDate") as? Date
    }

    func completeOnboarding(patientId: UUID) {
        self.patientId = patientId
        self.isOnboarded = true
        defaults.set(true, forKey: "isOnboarded")
        defaults.set(patientId.uuidString, forKey: "patientId")
    }

    func recordSync() {
        self.lastSyncDate = Date()
        defaults.set(Date(), forKey: "lastSyncDate")
    }

    func reset() {
        isOnboarded = false
        patientId = nil
        lastSyncDate = nil
        defaults.removeObject(forKey: "isOnboarded")
        defaults.removeObject(forKey: "patientId")
        defaults.removeObject(forKey: "lastSyncDate")
    }
}
```

**Step 3: Build to verify**

```bash
xcodebuild -project SevaroMonitor.xcodeproj \
  -scheme SevaroMonitor \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  build 2>&1 | tail -5
```
Expected: `BUILD SUCCEEDED`

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add data models matching Supabase wearable schema"
```

---

## Task 3: Supabase Service

**Files:**
- Create: `SevaroMonitor/Services/SupabaseService.swift`

**Step 1: Create SupabaseService.swift**

```swift
import Foundation
import Supabase

class SupabaseService: ObservableObject {
    static let shared = SupabaseService()

    let client: SupabaseClient

    private init() {
        client = SupabaseClient(
            supabaseURL: URL(string: "https://czspsioerfaktnnrnmcw.supabase.co")!,
            supabaseKey: "YOUR_ANON_KEY_HERE"
        )
    }

    // MARK: - Patient Operations

    func createPatient(_ patient: NewPatient) async throws -> WearablePatient {
        let result: WearablePatient = try await client
            .from("wearable_patients")
            .insert(patient)
            .select()
            .single()
            .execute()
            .value
        return result
    }

    func getPatient(id: UUID) async throws -> WearablePatient {
        let result: WearablePatient = try await client
            .from("wearable_patients")
            .select()
            .eq("id", value: id.uuidString)
            .single()
            .execute()
            .value
        return result
    }

    func updateBaseline(patientId: UUID, baseline: BaselineMetrics) async throws {
        try await client
            .from("wearable_patients")
            .update(["baseline_metrics": baseline] as [String: BaselineMetrics])
            .eq("id", value: patientId.uuidString)
            .execute()
    }

    // MARK: - Daily Summary Operations

    func upsertDailySummary(_ summary: DailySummaryUpload) async throws {
        try await client
            .from("wearable_daily_summaries")
            .upsert(summary, onConflict: "patient_id,date")
            .execute()
    }

    func getDailySummaries(patientId: UUID, days: Int = 30) async throws -> [DailySummaryRow] {
        let result: [DailySummaryRow] = try await client
            .from("wearable_daily_summaries")
            .select()
            .eq("patient_id", value: patientId.uuidString)
            .order("date", ascending: false)
            .limit(days)
            .execute()
            .value
        return result
    }

    // MARK: - Trigger AI Analysis

    func triggerAnalysis(patientId: UUID) async throws {
        // POST to the Sevaro Clinical API to trigger server-side AI analysis
        let sevaroBaseURL = "https://opsamplehtml.vercel.app"
        var request = URLRequest(url: URL(string: "\(sevaroBaseURL)/api/wearable/analyze")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["patient_id": patientId.uuidString])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw SupabaseServiceError.analysisFailed(body)
        }
    }
}

// Helper for reading summaries back
struct DailySummaryRow: Codable, Identifiable {
    let id: UUID
    let patientId: UUID
    let date: String
    let metrics: DailyMetrics
    let overallStatus: String

    enum CodingKeys: String, CodingKey {
        case id
        case patientId = "patient_id"
        case date, metrics
        case overallStatus = "overall_status"
    }
}

enum SupabaseServiceError: LocalizedError {
    case analysisFailed(String)

    var errorDescription: String? {
        switch self {
        case .analysisFailed(let msg):
            return "AI analysis failed: \(msg)"
        }
    }
}
```

**Note:** Replace `YOUR_ANON_KEY_HERE` with the actual anon key from the outpatient_synapse project. The Vercel URL should also be confirmed at runtime.

**Step 2: Build to verify**

```bash
xcodebuild build ...
```
Expected: `BUILD SUCCEEDED`

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Supabase service with patient CRUD and daily summary upsert"
```

---

## Task 4: HealthKit Data Collection Service

**Files:**
- Create: `SevaroMonitor/Services/HealthKitCollector.swift`

**Step 1: Create HealthKitCollector.swift**

This is the core service that reads all biometric data from HealthKit and aggregates into the `DailyMetrics` format:

```swift
import Foundation
import HealthKit

class HealthKitCollector: ObservableObject {
    private let store = HKHealthStore()
    @Published var isAuthorized = false

    // All types we want to read from Apple Watch via HealthKit
    private let readTypes: Set<HKObjectType> = [
        HKQuantityType(.heartRate),
        HKQuantityType(.restingHeartRate),
        HKQuantityType(.heartRateVariabilitySDNN),
        HKQuantityType(.oxygenSaturation),
        HKQuantityType(.stepCount),
        HKQuantityType(.activeEnergyBurned),
        HKCategoryType(.sleepAnalysis),
    ]

    static var isAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    // MARK: - Authorization

    func requestAuthorization() async throws {
        guard Self.isAvailable else {
            throw HealthKitCollectorError.notAvailable
        }
        try await store.requestAuthorization(toShare: [], read: readTypes)
        await MainActor.run { self.isAuthorized = true }
    }

    // MARK: - Collect Daily Metrics

    func collectDailyMetrics(for date: Date = Date()) async throws -> DailyMetrics {
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: date)
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: endOfDay)

        async let avgHr = averageQuantity(.heartRate, predicate: predicate, unit: .count().unitDivided(by: .minute()))
        async let restingHr = averageQuantity(.restingHeartRate, predicate: predicate, unit: .count().unitDivided(by: .minute()))
        async let hrvSdnn = averageQuantity(.heartRateVariabilitySDNN, predicate: predicate, unit: .secondUnit(with: .milli))
        async let spo2Avg = averageQuantity(.oxygenSaturation, predicate: predicate, unit: .percent())
        async let spo2Min = minQuantity(.oxygenSaturation, predicate: predicate, unit: .percent())
        async let steps = cumulativeQuantity(.stepCount, predicate: predicate, unit: .count())
        async let calories = cumulativeQuantity(.activeEnergyBurned, predicate: predicate, unit: .kilocalorie())
        async let sleepData = collectSleepData(predicate: predicate)

        let sleep = try await sleepData

        return DailyMetrics(
            avgHr: try await avgHr ?? 0,
            restingHr: try await restingHr ?? 0,
            hrvRmssd: try await hrvSdnn ?? 0, // SDNN as proxy; real RMSSD needs raw RR intervals
            hrv7dayAvg: nil, // Computed after upload from historical data
            spo2Avg: try await spo2Avg.map { $0 * 100 }, // Convert fraction to percentage
            spo2Min: try await spo2Min.map { $0 * 100 },
            dailySteps: Int(try await steps ?? 0),
            activeCalories: try await calories,
            sleepHours: sleep.totalHours,
            sleepEfficiency: sleep.efficiency,
            awakenings: sleep.awakenings,
            tremorPct: nil, // Requires CoreMotion session (Task 5)
            dyskineticMins: nil
        )
    }

    // MARK: - HealthKit Query Helpers

    private func averageQuantity(
        _ identifier: HKQuantityTypeIdentifier,
        predicate: NSPredicate,
        unit: HKUnit
    ) async throws -> Double? {
        let type = HKQuantityType(identifier)
        let descriptor = HKStatisticsQueryDescriptor(
            predicate: .init(quantityType: type, predicate: predicate),
            options: .discreteAverage
        )
        let result = try await descriptor.result(for: store)
        return result?.averageQuantity()?.doubleValue(for: unit)
    }

    private func minQuantity(
        _ identifier: HKQuantityTypeIdentifier,
        predicate: NSPredicate,
        unit: HKUnit
    ) async throws -> Double? {
        let type = HKQuantityType(identifier)
        let descriptor = HKStatisticsQueryDescriptor(
            predicate: .init(quantityType: type, predicate: predicate),
            options: .discreteMin
        )
        let result = try await descriptor.result(for: store)
        return result?.minimumQuantity()?.doubleValue(for: unit)
    }

    private func cumulativeQuantity(
        _ identifier: HKQuantityTypeIdentifier,
        predicate: NSPredicate,
        unit: HKUnit
    ) async throws -> Double? {
        let type = HKQuantityType(identifier)
        let descriptor = HKStatisticsQueryDescriptor(
            predicate: .init(quantityType: type, predicate: predicate),
            options: .cumulativeSum
        )
        let result = try await descriptor.result(for: store)
        return result?.sumQuantity()?.doubleValue(for: unit)
    }

    // MARK: - Sleep Analysis

    private struct SleepResult {
        var totalHours: Double = 0
        var efficiency: Double = 0
        var awakenings: Int = 0
    }

    private func collectSleepData(predicate: NSPredicate) async throws -> SleepResult {
        let type = HKCategoryType(.sleepAnalysis)
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.categorySample(type: type, predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        let samples = try await descriptor.result(for: store)

        guard !samples.isEmpty else { return SleepResult() }

        var asleepSeconds: TimeInterval = 0
        var inBedSeconds: TimeInterval = 0
        var awakeCount = 0

        for sample in samples {
            let duration = sample.endDate.timeIntervalSince(sample.startDate)
            let value = HKCategoryValueSleepAnalysis(rawValue: sample.value)

            switch value {
            case .inBed:
                inBedSeconds += duration
            case .asleepCore, .asleepDeep, .asleepREM, .asleepUnspecified:
                asleepSeconds += duration
                inBedSeconds += duration
            case .awake:
                awakeCount += 1
                inBedSeconds += duration
            default:
                break
            }
        }

        let totalHours = asleepSeconds / 3600.0
        let efficiency = inBedSeconds > 0 ? asleepSeconds / inBedSeconds : 0

        return SleepResult(
            totalHours: round(totalHours * 100) / 100,
            efficiency: round(efficiency * 100) / 100,
            awakenings: awakeCount
        )
    }
}

enum HealthKitCollectorError: LocalizedError {
    case notAvailable
    case queryFailed(String)

    var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "HealthKit is not available on this device"
        case .queryFailed(let msg):
            return "HealthKit query failed: \(msg)"
        }
    }
}
```

**Step 2: Build to verify**

Expected: `BUILD SUCCEEDED`

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add HealthKit collector with full biometric data aggregation"
```

---

## Task 5: CoreMotion Tremor Session Service

**Files:**
- Create: `SevaroMonitor/Services/TremorSessionService.swift`

**Step 1: Create TremorSessionService.swift**

On-demand 30-second motion recording that estimates tremor intensity from accelerometer data:

```swift
import Foundation
import CoreMotion
import Combine

@MainActor
class TremorSessionService: ObservableObject {
    private let motionManager = CMMotionManager()
    @Published var isRecording = false
    @Published var progress: Double = 0
    @Published var lastResult: TremorResult?

    struct TremorResult {
        let tremorPct: Double      // Estimated tremor percentage (0-100)
        let avgIntensity: Double   // Average motion intensity
        let peakIntensity: Double  // Peak motion intensity
        let durationSeconds: Int
        let timestamp: Date
    }

    private var samples: [(x: Double, y: Double, z: Double)] = []
    private var recordingTask: Task<Void, Never>?
    private let sessionDuration: TimeInterval = 30 // 30-second session

    func startSession() {
        guard motionManager.isAccelerometerAvailable else { return }
        samples.removeAll()
        isRecording = true
        progress = 0

        motionManager.accelerometerUpdateInterval = 1.0 / 50.0 // 50 Hz
        motionManager.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
            guard let self, let data else { return }
            self.samples.append((
                x: data.acceleration.x,
                y: data.acceleration.y,
                z: data.acceleration.z
            ))
        }

        recordingTask = Task {
            for i in 1...Int(sessionDuration) {
                try? await Task.sleep(for: .seconds(1))
                progress = Double(i) / sessionDuration
            }
            stopSession()
        }
    }

    func stopSession() {
        motionManager.stopAccelerometerUpdates()
        isRecording = false
        recordingTask?.cancel()

        guard !samples.isEmpty else { return }

        // Compute tremor proxy from acceleration magnitude variance
        let magnitudes = samples.map { sqrt($0.x * $0.x + $0.y * $0.y + $0.z * $0.z) }
        let mean = magnitudes.reduce(0, +) / Double(magnitudes.count)
        let variance = magnitudes.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(magnitudes.count)
        let stddev = sqrt(variance)

        // Count samples exceeding tremor threshold (>0.1g deviation)
        let tremorThreshold = 0.1
        let tremorSamples = magnitudes.filter { abs($0 - mean) > tremorThreshold }.count
        let tremorPct = (Double(tremorSamples) / Double(magnitudes.count)) * 100.0

        lastResult = TremorResult(
            tremorPct: round(tremorPct * 10) / 10,
            avgIntensity: round(stddev * 1000) / 1000,
            peakIntensity: round((magnitudes.max() ?? 0) * 100) / 100,
            durationSeconds: Int(sessionDuration),
            timestamp: Date()
        )
    }
}
```

**Step 2: Build to verify**

Expected: `BUILD SUCCEEDED`

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add CoreMotion tremor session service with intensity scoring"
```

---

## Task 6: Daily Sync Orchestrator

**Files:**
- Create: `SevaroMonitor/Services/SyncService.swift`

**Step 1: Create SyncService.swift**

This orchestrates the full daily sync pipeline — collect → aggregate → upload → trigger AI:

```swift
import Foundation

@MainActor
class SyncService: ObservableObject {
    private let healthKit: HealthKitCollector
    private let supabase: SupabaseService
    private let appState: AppState

    @Published var lastSyncMetrics: DailyMetrics?
    @Published var syncStatus: SyncStatus = .idle

    enum SyncStatus: Equatable {
        case idle
        case collecting
        case uploading
        case triggeringAI
        case completed
        case failed(String)
    }

    init(healthKit: HealthKitCollector, supabase: SupabaseService, appState: AppState) {
        self.healthKit = healthKit
        self.supabase = supabase
        self.appState = appState
    }

    func syncToday(tremorPct: Double? = nil) async {
        guard let patientId = appState.patientId else {
            syncStatus = .failed("No patient ID configured")
            return
        }

        do {
            // Step 1: Collect from HealthKit
            syncStatus = .collecting
            var metrics = try await healthKit.collectDailyMetrics()

            // Inject tremor data if available
            if let tremor = tremorPct {
                metrics.tremorPct = tremor
            }

            lastSyncMetrics = metrics

            // Step 2: Determine overall status
            let status = determineStatus(metrics: metrics)

            // Step 3: Upload to Supabase
            syncStatus = .uploading
            let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
            let summary = DailySummaryUpload(
                patientId: patientId,
                date: String(today),
                metrics: metrics,
                overallStatus: status
            )
            try await supabase.upsertDailySummary(summary)

            // Step 4: Trigger server-side AI analysis
            syncStatus = .triggeringAI
            try await supabase.triggerAnalysis(patientId: patientId)

            // Step 5: Record success
            appState.recordSync()
            syncStatus = .completed

            // Step 6: Update baseline if we have 7+ days
            await updateBaselineIfReady(patientId: patientId)

        } catch {
            syncStatus = .failed(error.localizedDescription)
        }
    }

    private func determineStatus(metrics: DailyMetrics) -> String {
        // Simple threshold-based status for now
        // Server-side AI does the real analysis
        if metrics.restingHr > 100 || metrics.sleepHours < 4 {
            return "concern"
        } else if metrics.restingHr > 85 || metrics.sleepHours < 5.5 {
            return "watch"
        }
        return "normal"
    }

    private func updateBaselineIfReady(patientId: UUID) async {
        do {
            let summaries = try await supabase.getDailySummaries(patientId: patientId, days: 7)
            guard summaries.count >= 7 else { return }

            let baseline = BaselineMetrics(
                restingHr: summaries.map(\.metrics.restingHr).reduce(0, +) / Double(summaries.count),
                hrvRmssd: summaries.map(\.metrics.hrvRmssd).reduce(0, +) / Double(summaries.count),
                avgSteps: Double(summaries.map(\.metrics.dailySteps).reduce(0, +)) / Double(summaries.count),
                sleepHours: summaries.map(\.metrics.sleepHours).reduce(0, +) / Double(summaries.count),
                sleepEfficiency: summaries.map(\.metrics.sleepEfficiency).reduce(0, +) / Double(summaries.count),
                tremorPct: nil
            )
            try await supabase.updateBaseline(patientId: patientId, baseline: baseline)
        } catch {
            print("Baseline update failed: \(error)")
        }
    }
}
```

**Step 2: Build to verify**

Expected: `BUILD SUCCEEDED`

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add sync orchestrator with collect-upload-analyze pipeline"
```

---

## Task 7: Background Task Registration

**Files:**
- Create: `SevaroMonitor/Services/BackgroundSyncManager.swift`
- Modify: `SevaroMonitor/SevaroMonitorApp.swift` (app entry point)

**Step 1: Create BackgroundSyncManager.swift**

```swift
import Foundation
import BackgroundTasks

class BackgroundSyncManager {
    static let taskIdentifier = "com.sevaro.monitor.daily-sync"

    static func register() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: taskIdentifier,
            using: nil
        ) { task in
            guard let refreshTask = task as? BGAppRefreshTask else { return }
            handleBackgroundSync(task: refreshTask)
        }
    }

    static func scheduleNextSync() {
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        // Schedule for early morning (iOS picks the exact time)
        request.earliestBeginDate = Calendar.current.date(
            byAdding: .hour,
            value: 20,
            to: Date()
        )
        do {
            try BGTaskScheduler.shared.submit(request)
            print("[BackgroundSync] Scheduled next sync")
        } catch {
            print("[BackgroundSync] Failed to schedule: \(error)")
        }
    }

    private static func handleBackgroundSync(task: BGAppRefreshTask) {
        // Schedule the next one immediately
        scheduleNextSync()

        let syncTask = Task {
            let healthKit = HealthKitCollector()
            let supabase = SupabaseService.shared
            let appState = await AppState()
            let syncService = await SyncService(
                healthKit: healthKit,
                supabase: supabase,
                appState: appState
            )
            await syncService.syncToday()
        }

        task.expirationHandler = {
            syncTask.cancel()
        }

        Task {
            await syncTask.value
            task.setTaskCompleted(success: true)
        }
    }
}
```

**Step 2: Update SevaroMonitorApp.swift**

```swift
import SwiftUI

@main
struct SevaroMonitorApp: App {
    @StateObject private var appState = AppState()
    @StateObject private var healthKit = HealthKitCollector()

    init() {
        BackgroundSyncManager.register()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .environmentObject(healthKit)
                .onAppear {
                    BackgroundSyncManager.scheduleNextSync()
                }
        }
    }
}
```

**Step 3: Build to verify**

Expected: `BUILD SUCCEEDED`

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add background task manager for daily HealthKit sync"
```

---

## Task 8: Setup Screen (Onboarding)

**Files:**
- Create: `SevaroMonitor/Views/SetupView.swift`

**Step 1: Create SetupView.swift**

Three-step onboarding: patient info → HealthKit permissions → confirmation:

```swift
import SwiftUI

struct SetupView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var healthKit: HealthKitCollector
    @State private var step = 1
    @State private var name = ""
    @State private var age = ""
    @State private var sex = "M"
    @State private var diagnosis = ""
    @State private var medication = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                // Progress indicator
                HStack(spacing: 8) {
                    ForEach(1...3, id: \.self) { i in
                        Circle()
                            .fill(i <= step ? Color.blue : Color.gray.opacity(0.3))
                            .frame(width: 10, height: 10)
                    }
                }
                .padding(.top)

                switch step {
                case 1: patientInfoStep
                case 2: healthKitStep
                case 3: confirmationStep
                default: EmptyView()
                }
            }
            .padding()
            .navigationTitle("Setup")
        }
    }

    private var patientInfoStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Patient Information")
                .font(.title2.bold())
            Text("This creates your monitoring profile in the Sevaro system.")
                .foregroundStyle(.secondary)

            TextField("Full Name", text: $name)
                .textFieldStyle(.roundedBorder)
            TextField("Age", text: $age)
                .textFieldStyle(.roundedBorder)
                .keyboardType(.numberPad)
            Picker("Sex", selection: $sex) {
                Text("Male").tag("M")
                Text("Female").tag("F")
            }
            .pickerStyle(.segmented)
            TextField("Primary Diagnosis", text: $diagnosis)
                .textFieldStyle(.roundedBorder)
            TextField("Current Medications", text: $medication)
                .textFieldStyle(.roundedBorder)

            Spacer()

            Button("Continue") { step = 2 }
                .buttonStyle(.borderedProminent)
                .disabled(name.isEmpty || age.isEmpty || diagnosis.isEmpty)
        }
    }

    private var healthKitStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "heart.text.square.fill")
                .font(.system(size: 60))
                .foregroundStyle(.red)

            Text("Health Data Access")
                .font(.title2.bold())
            Text("Sevaro Monitor needs access to your Apple Watch health data including heart rate, HRV, sleep, steps, and blood oxygen.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            Spacer()

            Button("Authorize HealthKit") {
                Task {
                    do {
                        try await healthKit.requestAuthorization()
                        step = 3
                    } catch {
                        errorMessage = error.localizedDescription
                    }
                }
            }
            .buttonStyle(.borderedProminent)

            if let error = errorMessage {
                Text(error).foregroundStyle(.red).font(.caption)
            }
        }
    }

    private var confirmationStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 60))
                .foregroundStyle(.green)

            Text("Ready to Monitor")
                .font(.title2.bold())
            Text("Your profile will be created and daily health data syncing will begin.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                Label(name, systemImage: "person.fill")
                Label("\(age) years old, \(sex == "M" ? "Male" : "Female")", systemImage: "calendar")
                Label(diagnosis, systemImage: "stethoscope")
                if !medication.isEmpty {
                    Label(medication, systemImage: "pill.fill")
                }
                Label("Apple Watch", systemImage: "applewatch")
            }
            .padding()
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Spacer()

            Button("Start Monitoring") {
                Task { await createPatientAndFinish() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isLoading)

            if isLoading {
                ProgressView()
            }
        }
    }

    private func createPatientAndFinish() async {
        isLoading = true
        defer { isLoading = false }

        let meds: [PatientMedication] = medication.isEmpty ? [] :
            [PatientMedication(name: medication, dose: nil, frequency: nil)]

        let patient = NewPatient(
            name: name,
            age: Int(age) ?? 0,
            sex: sex,
            primaryDiagnosis: diagnosis,
            medications: meds,
            wearableDevices: [
                PatientDevice(name: "Apple Watch", status: "connected", dataTypes: [
                    "hr", "hrv", "steps", "sleep", "spo2", "accelerometer"
                ])
            ],
            baselineMetrics: BaselineMetrics(
                restingHr: 0, hrvRmssd: 0, avgSteps: 0,
                sleepHours: 0, sleepEfficiency: 0, tremorPct: nil
            ),
            monitoringStartDate: ISO8601DateFormatter().string(from: Date()).prefix(10).description
        )

        do {
            let created = try await SupabaseService.shared.createPatient(patient)
            appState.completeOnboarding(patientId: created.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
```

**Step 2: Build to verify**

Expected: `BUILD SUCCEEDED`

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add setup/onboarding view with patient creation"
```

---

## Task 9: Dashboard Screen

**Files:**
- Create: `SevaroMonitor/Views/DashboardView.swift`

**Step 1: Create DashboardView.swift**

Main screen showing today's metrics, sync status, and tremor check button:

```swift
import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var healthKit: HealthKitCollector
    @StateObject private var syncService: SyncService
    @StateObject private var tremorService = TremorSessionService()
    @State private var showSettings = false

    init() {
        let hk = HealthKitCollector()
        _syncService = StateObject(wrappedValue: SyncService(
            healthKit: hk,
            supabase: .shared,
            appState: AppState()
        ))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    syncStatusCard
                    if let metrics = syncService.lastSyncMetrics {
                        metricsGrid(metrics)
                    }
                    tremorCard
                    syncButton
                }
                .padding()
            }
            .navigationTitle("Sevaro Monitor")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { showSettings = true }) {
                        Image(systemName: "gear")
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
            .task {
                // Auto-sync on open if not synced today
                if !syncedToday {
                    await syncService.syncToday()
                }
            }
        }
    }

    private var syncedToday: Bool {
        guard let last = appState.lastSyncDate else { return false }
        return Calendar.current.isDateInToday(last)
    }

    private var syncStatusCard: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Sync Status")
                    .font(.headline)
                switch syncService.syncStatus {
                case .idle:
                    Text(syncedToday ? "Synced today" : "Not synced today")
                        .foregroundStyle(syncedToday ? .green : .orange)
                case .collecting:
                    Text("Reading HealthKit data...")
                        .foregroundStyle(.blue)
                case .uploading:
                    Text("Uploading to Sevaro...")
                        .foregroundStyle(.blue)
                case .triggeringAI:
                    Text("Running AI analysis...")
                        .foregroundStyle(.purple)
                case .completed:
                    Text("Sync complete")
                        .foregroundStyle(.green)
                case .failed(let msg):
                    Text("Failed: \(msg)")
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }
            Spacer()
            if case .collecting = syncService.syncStatus {
                ProgressView()
            } else if case .uploading = syncService.syncStatus {
                ProgressView()
            } else if case .triggeringAI = syncService.syncStatus {
                ProgressView()
            }
        }
        .padding()
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func metricsGrid(_ metrics: DailyMetrics) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            metricCard("Resting HR", value: "\(Int(metrics.restingHr))", unit: "bpm", icon: "heart.fill", color: .red)
            metricCard("HRV", value: "\(Int(metrics.hrvRmssd))", unit: "ms", icon: "waveform.path.ecg", color: .green)
            metricCard("Steps", value: "\(metrics.dailySteps)", unit: "", icon: "figure.walk", color: .blue)
            metricCard("Sleep", value: String(format: "%.1f", metrics.sleepHours), unit: "hrs", icon: "bed.double.fill", color: .purple)
            if let spo2 = metrics.spo2Avg {
                metricCard("SpO2", value: String(format: "%.0f", spo2), unit: "%", icon: "lungs.fill", color: .cyan)
            }
            if let tremor = metrics.tremorPct {
                metricCard("Tremor", value: String(format: "%.1f", tremor), unit: "%", icon: "hand.raised.fill", color: .orange)
            }
        }
    }

    private func metricCard(_ title: String, value: String, unit: String, icon: String, color: Color) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(color)
            Text(value + (unit.isEmpty ? "" : " \(unit)"))
                .font(.title3.bold())
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var tremorCard: some View {
        VStack(spacing: 12) {
            Text("Tremor Check")
                .font(.headline)
            Text("Hold your phone naturally for 30 seconds")
                .font(.caption)
                .foregroundStyle(.secondary)

            if tremorService.isRecording {
                ProgressView(value: tremorService.progress)
                    .progressViewStyle(.linear)
                Text("Recording... \(Int(tremorService.progress * 30))s")
            } else if let result = tremorService.lastResult {
                Text("Last: \(String(format: "%.1f", result.tremorPct))% tremor")
                    .foregroundStyle(.orange)
            }

            Button(tremorService.isRecording ? "Stop" : "Start Tremor Check") {
                if tremorService.isRecording {
                    tremorService.stopSession()
                } else {
                    tremorService.startSession()
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)
        }
        .padding()
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var syncButton: some View {
        Button("Sync Now") {
            Task {
                await syncService.syncToday(tremorPct: tremorService.lastResult?.tremorPct)
            }
        }
        .buttonStyle(.bordered)
        .disabled(syncService.syncStatus == .collecting ||
                  syncService.syncStatus == .uploading ||
                  syncService.syncStatus == .triggeringAI)
    }
}
```

**Step 2: Build to verify**

Expected: `BUILD SUCCEEDED`

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add dashboard view with metrics grid, tremor check, and sync"
```

---

## Task 10: Settings Screen & ContentView Router

**Files:**
- Create: `SevaroMonitor/Views/SettingsView.swift`
- Create: `SevaroMonitor/Views/ContentView.swift`

**Step 1: Create SettingsView.swift**

```swift
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    @State private var showResetConfirm = false

    var body: some View {
        NavigationStack {
            List {
                Section("Patient") {
                    if let id = appState.patientId {
                        LabeledContent("Patient ID", value: id.uuidString.prefix(8).description)
                    }
                    if let lastSync = appState.lastSyncDate {
                        LabeledContent("Last Sync", value: lastSync.formatted())
                    }
                }

                Section("Data Collection") {
                    Label("Heart Rate", systemImage: "heart.fill")
                    Label("HRV", systemImage: "waveform.path.ecg")
                    Label("Blood Oxygen", systemImage: "lungs.fill")
                    Label("Steps", systemImage: "figure.walk")
                    Label("Sleep", systemImage: "bed.double.fill")
                    Label("Tremor (manual)", systemImage: "hand.raised.fill")
                }

                Section("Connection") {
                    LabeledContent("Backend", value: "Sevaro Clinical")
                    LabeledContent("Status", value: "Connected")
                }

                Section {
                    Button("Reset App", role: .destructive) {
                        showResetConfirm = true
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .alert("Reset App?", isPresented: $showResetConfirm) {
                Button("Cancel", role: .cancel) {}
                Button("Reset", role: .destructive) {
                    appState.reset()
                    dismiss()
                }
            } message: {
                Text("This will remove your patient profile and require re-setup.")
            }
        }
    }
}
```

**Step 2: Create ContentView.swift**

Routes between Setup and Dashboard based on onboarding state:

```swift
import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        if appState.isOnboarded {
            DashboardView()
        } else {
            SetupView()
        }
    }
}
```

**Step 3: Build to verify**

Expected: `BUILD SUCCEEDED`

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add settings view and content router"
```

---

## Task 11: Build, Deploy to Device, and End-to-End Test

**Files:**
- No new files — integration testing

**Step 1: Build for device**

```bash
xcodebuild -project "/Users/stevearbogast/dev/repos/SevaroMonitor/SevaroMonitor.xcodeproj" \
  -scheme SevaroMonitor \
  -destination 'id=00008140-0000146C0A53001C' \
  -allowProvisioningUpdates \
  build 2>&1 | tail -10
```
Expected: `BUILD SUCCEEDED`

**Step 2: Install on device**

```bash
xcrun devicectl device install app \
  --device 4A7995D3-2659-5A11-9BB3-08A43D34FDA7 \
  "<DerivedData path>/Build/Products/Debug-iphoneos/SevaroMonitor.app"
```

**Step 3: Manual end-to-end test checklist**

1. Open app → Setup screen appears
2. Enter patient info → tap Continue
3. HealthKit permission prompt appears → authorize
4. Tap "Start Monitoring" → patient created in Supabase
5. Dashboard screen appears → auto-sync begins
6. Metrics populate from Apple Watch data
7. Try "Tremor Check" → 30-second recording → result shows
8. Tap "Sync Now" → data uploads to Supabase
9. Open Sevaro Clinical `/wearable` → your real data appears in timeline
10. Check Supabase `wearable_daily_summaries` table → your row exists

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Sevaro Monitor v0.1 — HealthKit to Supabase pipeline complete"
```

---

## Summary

| Task | Description | Estimated Time |
|------|-------------|---------------|
| 1 | Scaffold Xcode project + capabilities | 15 min |
| 2 | Data models (Codable structs matching DB) | 10 min |
| 3 | Supabase service (CRUD + AI trigger) | 10 min |
| 4 | HealthKit collector (all biometric queries) | 20 min |
| 5 | CoreMotion tremor session service | 10 min |
| 6 | Sync orchestrator (collect → upload → analyze) | 10 min |
| 7 | Background task registration | 10 min |
| 8 | Setup/onboarding screen | 15 min |
| 9 | Dashboard screen with metrics grid | 15 min |
| 10 | Settings screen + content router | 10 min |
| 11 | Device build + end-to-end test | 15 min |
| **Total** | | **~2.5 hours** |
