package com.blurryq.weighttracker

import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.Period

/**
 * Minimal Health Connect bridge: read-only access to daily calories-consumed totals, which is
 * all Weight Tracker needs from it (MyFitnessPal writes those totals into Health Connect).
 *
 * Deliberately not a general-purpose plugin — one permission, one query. The JS side is
 * src/data/healthConnect.ts.
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    private val permissions = setOf(HealthPermission.getReadPermission(NutritionRecord::class))
    private val scope = CoroutineScope(Dispatchers.IO)

    private fun clientOrNull(): HealthConnectClient? =
        if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) {
            HealthConnectClient.getOrCreate(context)
        } else {
            null
        }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val available = HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
        call.resolve(JSObject().put("available", available))
    }

    @PluginMethod
    fun hasPermission(call: PluginCall) {
        val client = clientOrNull()
        if (client == null) {
            call.resolve(JSObject().put("granted", false))
            return
        }
        scope.launch {
            val granted = try {
                client.permissionController.getGrantedPermissions().containsAll(permissions)
            } catch (e: Exception) {
                false
            }
            call.resolve(JSObject().put("granted", granted))
        }
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (clientOrNull() == null) {
            call.resolve(JSObject().put("granted", false))
            return
        }
        val intent = PermissionController
            .createRequestPermissionResultContract()
            .createIntent(context, permissions)
        startActivityForResult(call, intent, "permissionCallback")
    }

    @ActivityCallback
    private fun permissionCallback(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val granted = PermissionController
            .createRequestPermissionResultContract()
            .parseResult(result.resultCode, result.data)
        call.resolve(JSObject().put("granted", granted.containsAll(permissions)))
    }

    /**
     * `readDailyCalories({ startDate, endDate })` — ISO dates, inclusive. Resolves
     * `{ days: [{ date: "YYYY-MM-DD", kcal: number }] }`, one entry per day that had any
     * nutrition record. Days with no data are omitted.
     */
    @PluginMethod
    fun readDailyCalories(call: PluginCall) {
        val client = clientOrNull()
        if (client == null) {
            call.resolve(JSObject().put("days", JSArray()))
            return
        }
        val startDate = call.getString("startDate")
        val endDate = call.getString("endDate")
        if (startDate == null || endDate == null) {
            call.reject("startDate and endDate are required")
            return
        }
        scope.launch {
            try {
                val start = LocalDate.parse(startDate).atStartOfDay()
                val end = LocalDate.parse(endDate).plusDays(1).atStartOfDay()
                val request = AggregateGroupByPeriodRequest(
                    metrics = setOf(NutritionRecord.ENERGY_TOTAL),
                    timeRangeFilter = TimeRangeFilter.between(start, end),
                    timeRangeSlicer = Period.ofDays(1),
                )
                val days = JSArray()
                for (group in client.aggregateGroupByPeriod(request)) {
                    val kcal = group.result[NutritionRecord.ENERGY_TOTAL]?.inKilocalories ?: continue
                    days.put(
                        JSObject()
                            .put("date", group.startTime.toLocalDate().toString())
                            .put("kcal", Math.round(kcal)),
                    )
                }
                call.resolve(JSObject().put("days", days))
            } catch (e: Exception) {
                call.reject("Health Connect read failed: ${e.message}", e)
            }
        }
    }
}
