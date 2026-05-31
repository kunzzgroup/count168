<?php
/**
 * 维护跑马灯前缀类型
 */

function maintenanceMarqueeLabelOptions(): array {
    return [
        'maintenance' => '系统维护中：',
        'reminder'    => '温馨提示：',
    ];
}

function normalizeMaintenanceLabelType(?string $value): string {
    $options = maintenanceMarqueeLabelOptions();
    $value = strtolower(trim((string) $value));
    return array_key_exists($value, $options) ? $value : 'maintenance';
}

function maintenanceMarqueeLabelText(?string $labelType): string {
    $options = maintenanceMarqueeLabelOptions();
    $labelType = normalizeMaintenanceLabelType($labelType);
    return $options[$labelType];
}
