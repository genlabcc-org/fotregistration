import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../../lib/api';
import type { ScannerScanResult } from '../../types';
import { IconCamera, IconCheck, IconAlertCircle, IconClock, IconRefresh, IconUpload } from '../../lib/icons';

interface CameraDevice {
  id: string;
  label: string;
}

export const ScannerView: React.FC = () => {
  const [scanResult, setScanResult] = useState<ScannerScanResult | null>(null);
  const [recentScans, setRecentScans] = useState<ScannerScanResult[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isQuickConfirming, setIsQuickConfirming] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastScannedRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const isTransitioningRef = useRef(false);

  const handleQuickConfirm = async () => {
    if (!scanResult?.registrationId) return;
    setIsQuickConfirming(true);
    try {
      const result = await api.quickConfirmScanner({
        registrationId: scanResult.registrationId,
        attendeeId: scanResult.attendee?.id,
      });
      setScanResult(result);
      setRecentScans((prev) => [result, ...prev.slice(0, 19)]);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([80, 40, 80]);
      }
    } catch (err: unknown) {
      alert((err as Error).message || 'Failed to approve registration.');
    } finally {
      setIsQuickConfirming(false);
    }
  };

  const handleProcessCode = useCallback(async (rawText: string) => {
    const cleanText = rawText.trim();
    if (!cleanText || isVerifying) return;

    // Cooldown for the same code to prevent duplicate alerts while camera is aimed at QR
    const now = Date.now();
    if (cleanText === lastScannedRef.current.code && now - lastScannedRef.current.time < 3500) {
      return;
    }
    lastScannedRef.current = { code: cleanText, time: now };
    setIsVerifying(true);

    try {
      let payload: { token?: string; manualCode?: string } = {};
      if (cleanText.includes('.') && cleanText.length > 50 && !cleanText.includes(' ') && !cleanText.startsWith('http')) {
        payload = { token: cleanText };
      } else {
        payload = { manualCode: cleanText };
      }

      const result = await api.verifyScan(payload);
      setScanResult(result);
      setRecentScans((prev) => [result, ...prev.slice(0, 19)]);

      // Haptic confirmation feedback on mobile devices
      if (result.status === 'VALID' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([80, 40, 80]);
      }
    } catch (err: unknown) {
      const fallbackResult: ScannerScanResult = {
        status: 'INVALID',
        message: (err as Error).message || 'Pass not found or network error.',
      };
      setScanResult(fallbackResult);
      setRecentScans((prev) => [fallbackResult, ...prev.slice(0, 19)]);
    } finally {
      setIsVerifying(false);
    }
  }, [isVerifying]);

  const handleProcessCodeRef = useRef(handleProcessCode);
  handleProcessCodeRef.current = handleProcessCode;

  const stopCameraStream = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn('[SCANNER] Camera stop warning:', err);
      } finally {
        scannerRef.current = null;
      }
    }
  };

  const startCameraStream = async (cameraIdToUse?: string) => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setCameraError(null);
    setIsStartingCamera(true);

    // Insecure Context check (Mobile browsers strictly block getUserMedia on non-HTTPS origins)
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!window.isSecureContext && !isLocalhost) {
      setCameraError(
        'Mobile browsers require HTTPS for live video streaming. Use "Take Photo to Scan" below or open the app over HTTPS.'
      );
      setIsStartingCamera(false);
      isTransitioningRef.current = false;
      return;
    }

    try {
      await stopCameraStream();

      // Ensure element exists before instantiating
      const container = document.getElementById('qr-reader-container');
      if (!container) {
        setIsStartingCamera(false);
        isTransitioningRef.current = false;
        return;
      }

      // Always create a clean instance for this DOM container
      const scanner = new Html5Qrcode('qr-reader-container', { verbose: false });
      scannerRef.current = scanner;

      // Query available cameras
      let availableDevices = cameras;
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          availableDevices = devices;
          setCameras(devices);
        }
      } catch {
        // May fail prior to first permission prompt
      }

      // Configuration: prioritize back/environment camera on phones
      let cameraConfig: string | { facingMode: string };

      if (cameraIdToUse) {
        cameraConfig = cameraIdToUse;
      } else {
        // Find best rear camera if available
        const rearCamera = availableDevices.find((d) => {
          const l = (d.label || '').toLowerCase();
          return l.includes('back') || l.includes('rear') || l.includes('environment') || l.includes('0, facing back');
        });

        if (rearCamera) {
          cameraConfig = rearCamera.id;
          setSelectedCameraId(rearCamera.id);
        } else {
          // Standard environment facing mode (valid string format in html5-qrcode)
          cameraConfig = { facingMode: 'environment' };
        }
      }

      const scanConfig = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.max(Math.floor(minEdge * 0.72), 180);
          return { width: size, height: size };
        },
      };

      try {
        await scanner.start(
          cameraConfig,
          scanConfig,
          (decodedText) => {
            handleProcessCodeRef.current(decodedText);
          },
          () => {
            // ignore scan frame errors
          }
        );
      } catch (startErr: unknown) {
        // If specific rear camera ID failed, attempt direct facingMode: environment
        if (typeof cameraConfig === 'string') {
          console.warn('[SCANNER] Specific camera ID failed, trying environment facingMode...');
          await scanner.start(
            { facingMode: 'environment' },
            scanConfig,
            (decodedText) => {
              handleProcessCodeRef.current(decodedText);
            },
            () => {}
          );
        } else {
          // If environment mode failed, only fallback to user camera if no other options
          const anyCam = availableDevices.length > 0 ? availableDevices[0].id : { facingMode: 'user' };
          await scanner.start(
            anyCam,
            scanConfig,
            (decodedText) => {
              handleProcessCodeRef.current(decodedText);
            },
            () => {}
          );
        }
      }

      // Query devices again now that permission has been granted
      try {
        const freshDevices = await Html5Qrcode.getCameras();
        if (freshDevices && freshDevices.length > 0) {
          setCameras(freshDevices);
        }
      } catch {
        // ignore
      }

      // Check for torch capability
      try {
        const capabilities = scanner.getRunningTrackCapabilities();
        setTorchAvailable(!!(capabilities as Record<string, unknown>)?.torch);
      } catch {
        setTorchAvailable(false);
      }
    } catch (err: unknown) {
      console.error('[SCANNER] Camera startup error:', err);
      const errMsg = (err as Error)?.message || String(err);
      if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission')) {
        setCameraError('Camera permission was denied. Please allow camera access in browser site settings.');
      } else if (errMsg.includes('NotFoundError') || errMsg.includes('DevicesNotFoundError')) {
        setCameraError('No camera detected on this device. You can snap a photo or enter the code manually.');
      } else if (errMsg.includes('NotReadableError') || errMsg.includes('TrackStartError')) {
        setCameraError('Camera is currently busy or in use by another app. Please close other camera apps and retry.');
      } else {
        setCameraError(errMsg || 'Failed to start camera. Use "Take Photo" below or enter ticket code manually.');
      }
    } finally {
      setIsStartingCamera(false);
      isTransitioningRef.current = false;
    }
  };

  // Handle camera mount/unmount and toggling
  useEffect(() => {
    if (cameraActive) {
      startCameraStream(selectedCameraId);
    } else {
      stopCameraStream();
    }

    return () => {
      stopCameraStream();
    };
  }, [cameraActive, selectedCameraId]);

  // Switch to next available camera
  const handleSwitchCamera = async () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex];
    setSelectedCameraId(nextCamera.id);
  };

  // Toggle mobile flashlight / torch
  const toggleTorch = async () => {
    if (scannerRef.current && torchAvailable) {
      try {
        await scannerRef.current.applyVideoConstraints({
          advanced: [{ torch: !torchOn } as unknown as MediaTrackConstraintSet],
        });
        setTorchOn(!torchOn);
      } catch (err) {
        console.warn('Torch toggle failed:', err);
      }
    }
  };

  // Mobile photo snapshot fallback (100% reliable even over HTTP or restrictive browsers)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsVerifying(true);
    try {
      const helper = new Html5Qrcode('qr-file-helper', { verbose: false });
      const decodedText = await helper.scanFile(file, false);
      await helper.clear();
      await handleProcessCode(decodedText);
    } catch {
      setScanResult({
        status: 'INVALID',
        message: 'Could not read QR code from the captured photo. Ensure the ticket QR code is clear and in focus.',
      });
    } finally {
      setIsVerifying(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleProcessCode(manualCode.trim());
    setManualCode('');
  };

  const clearCurrentScan = () => {
    setScanResult(null);
  };

  return (
    <div className="space-y-8">
      {/* Hidden container for auxiliary photo scanning */}
      <div id="qr-file-helper" className="hidden" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E6E6DF] pb-6">
        <div>
          <span className="text-xs text-[#8C8C85] font-mono uppercase tracking-wider font-bold block mb-1">
            Entrance Management
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#0A0A0A]">
            Ticket Scanner
          </h1>
          <p className="text-xs text-[#55554F] mt-1 font-medium">
            Scan QR passes with device camera, snap pass photos on mobile, or enter attendee codes manually.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mobile Direct Photo Capture Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-10 px-4 rounded-xl bg-[#FFFFFF] hover:bg-[#F2F2EC] border border-[#E6E6DF] text-xs font-bold text-[#0A0A0A] inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <IconUpload size={14} />
            <span>Take photo / Upload</span>
          </button>

          <button
            type="button"
            onClick={() => setCameraActive(!cameraActive)}
            className="h-10 px-4 rounded-xl bg-[#FFFFFF] hover:bg-[#F2F2EC] border border-[#E6E6DF] text-xs font-bold text-[#0A0A0A] inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <IconCamera size={14} />
            <span>{cameraActive ? 'Turn off camera' : 'Enable camera'}</span>
          </button>
        </div>
      </div>

      {/* Main Scanner 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Camera + Manual Entry (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Camera Viewfinder */}
          {cameraActive ? (
            <div className="p-6 bg-[#FFFFFF] rounded-2xl border border-[#E6E6DF] shadow-studio space-y-4">
              <div className="flex items-center justify-between border-b border-[#E6E6DF] pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                  <h2 className="text-sm font-bold text-[#0A0A0A]">
                    Live Video Scanner
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  {cameras.length > 1 && (
                    <>
                      <select
                        value={selectedCameraId}
                        onChange={(e) => setSelectedCameraId(e.target.value)}
                        className="h-8 px-2 rounded-lg bg-[#FAFAF7] hover:bg-[#F2F2EC] border border-[#E6E6DF] text-[11px] font-bold text-[#0A0A0A] transition-colors cursor-pointer max-w-[140px] truncate"
                      >
                        {cameras.map((cam, idx) => (
                          <option key={cam.id} value={cam.id}>
                            {cam.label || `Camera ${idx + 1}`}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={handleSwitchCamera}
                        title="Switch camera"
                        className="h-8 px-2.5 rounded-lg bg-[#FAFAF7] hover:bg-[#F2F2EC] border border-[#E6E6DF] text-[11px] font-bold text-[#0A0A0A] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <IconRefresh size={12} />
                        <span className="hidden sm:inline">Flip</span>
                      </button>
                    </>
                  )}

                  {torchAvailable && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      className={`h-8 px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        torchOn
                          ? 'bg-[#C2E600] border-[#C2E600] text-[#0A0A0A]'
                          : 'bg-[#FAFAF7] hover:bg-[#F2F2EC] border-[#E6E6DF] text-[#0A0A0A]'
                      }`}
                    >
                      <span>{torchOn ? 'Torch ON' : 'Torch'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Camera Error Alert if mobile permissions or insecure origin blocked */}
              {cameraError && (
                <div className="p-4 rounded-xl bg-[#FFF5F5] border border-[#E53935]/30 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <IconAlertCircle size={16} className="text-[#E53935] mt-0.5 shrink-0" />
                    <div className="text-xs text-[#0A0A0A]">
                      <div className="font-bold">Camera Access Issue</div>
                      <p className="text-[#55554F] mt-0.5 leading-relaxed">{cameraError}</p>
                    </div>
                  </div>
                  <div className="pt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-[#0A0A0A] text-[#FAFAF7] text-xs font-bold cursor-pointer"
                    >
                      Take photo to scan
                    </button>
                    <button
                      type="button"
                      onClick={() => startCameraStream(selectedCameraId)}
                      className="px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E6E6DF] text-xs font-bold text-[#0A0A0A] cursor-pointer"
                    >
                      Retry camera
                    </button>
                  </div>
                </div>
              )}

              {/* Viewfinder Element */}
              <div className="relative overflow-hidden rounded-xl bg-[#0A0A0A] border border-[#E6E6DF] min-h-[260px] flex items-center justify-center">
                <div id="qr-reader-container" className="w-full" />
                {isStartingCamera && !cameraError && (
                  <div className="absolute inset-0 bg-[#0A0A0A]/70 flex flex-col items-center justify-center text-white text-xs gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Accessing rear camera...</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#8C8C85]">
                <span>Aim rear camera directly at attendee pass QR code.</span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[#0A0A0A] font-bold underline hover:text-[#55554F] cursor-pointer"
                >
                  Snap photo instead
                </button>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-[#FFFFFF] rounded-2xl border border-[#E6E6DF] space-y-3 shadow-studio">
              <IconCamera size={32} className="mx-auto text-[#8C8C85]" />
              <div className="text-sm font-bold text-[#0A0A0A]">Live camera is turned off</div>
              <p className="text-xs text-[#55554F]">
                You can snap photos using the button above or type ticket codes manually below.
              </p>
            </div>
          )}

          {/* Manual Entry Form */}
          <div className="p-6 bg-[#FFFFFF] rounded-2xl border border-[#E6E6DF] shadow-studio space-y-4">
            <h2 className="text-sm font-bold text-[#0A0A0A] border-b border-[#E6E6DF] pb-3">
              Manual Ticket Code Verification
            </h2>

            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. FOT-0001, email, phone, or ATT ID"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="field-input flex-1 text-xs"
              />
              <button
                type="submit"
                disabled={isVerifying || !manualCode.trim()}
                className="h-[52px] px-6 rounded-xl bg-[#0A0A0A] hover:bg-[#222222] text-[#FAFAF7] text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                {isVerifying ? 'Checking...' : 'Verify'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Scan Result Callout & Scan History (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Active Result Card */}
          {scanResult ? (
            <div
              className={`p-6 sm:p-8 rounded-2xl border shadow-studio space-y-5 ${
                scanResult.status === 'VALID'
                  ? 'bg-[#F0FDF4] border-[#10B981]'
                  : scanResult.status === 'ALREADY_CHECKED_IN'
                  ? 'bg-[#FFFBEB] border-[#F59E0B]'
                  : scanResult.status === 'PENDING_PAYMENT'
                  ? 'bg-[#FEFCE8] border-[#EAB308]'
                  : 'bg-[#FFF5F5] border-[#E53935]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {scanResult.status === 'VALID' && (
                    <span className="w-8 h-8 rounded-full bg-[#10B981] text-white flex items-center justify-center">
                      <IconCheck size={18} />
                    </span>
                  )}
                  {scanResult.status === 'ALREADY_CHECKED_IN' && (
                    <span className="w-8 h-8 rounded-full bg-[#F59E0B] text-white flex items-center justify-center">
                      <IconClock size={18} />
                    </span>
                  )}
                  {scanResult.status === 'PENDING_PAYMENT' && (
                    <span className="w-8 h-8 rounded-full bg-[#EAB308] text-white flex items-center justify-center">
                      <IconClock size={18} />
                    </span>
                  )}
                  {(scanResult.status === 'INVALID' || scanResult.status === 'REJECTED') && (
                    <span className="w-8 h-8 rounded-full bg-[#E53935] text-white flex items-center justify-center">
                      <IconAlertCircle size={18} />
                    </span>
                  )}

                  <span className="text-base font-bold text-[#0A0A0A]">
                    {scanResult.status === 'VALID'
                      ? 'Admit Attendee'
                      : scanResult.status === 'ALREADY_CHECKED_IN'
                      ? 'Already Checked In'
                      : scanResult.status === 'PENDING_PAYMENT'
                      ? 'Registration Pending Approval'
                      : scanResult.status === 'REJECTED'
                      ? 'Registration Rejected'
                      : 'Entry Denied'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={clearCurrentScan}
                  className="text-xs font-semibold text-[#8C8C85] hover:text-[#0A0A0A] cursor-pointer"
                >
                  Clear
                </button>
              </div>

              <div className="text-xs text-[#55554F] leading-relaxed">
                {scanResult.message}
              </div>

              {scanResult.attendee && (
                <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E6E6DF] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#0A0A0A] text-sm">{scanResult.attendee.name}</span>
                    <span className="font-mono text-[#8C8C85]">{scanResult.attendee.ticketCode}</span>
                  </div>
                  <div className="text-[#55554F]">
                    {scanResult.attendee.email} · +91 {scanResult.attendee.phone}
                  </div>
                  <div className="pt-2 border-t border-[#E6E6DF] flex items-center justify-between text-[11px]">
                    <span className="text-[#8C8C85]">Format:</span>
                    <span className="font-bold text-[#0A0A0A]">
                      {scanResult.attendee.team_identifier || scanResult.attendee.team || 'Solo'}
                    </span>
                  </div>
                </div>
              )}

              {/* Quick Confirm & Admit button if registration is pending */}
              {scanResult.status === 'PENDING_PAYMENT' && scanResult.registrationId && (
                <button
                  type="button"
                  onClick={handleQuickConfirm}
                  disabled={isQuickConfirming}
                  className="w-full py-3 px-4 rounded-xl bg-[#0A0A0A] hover:bg-[#222222] text-[#FAFAF7] text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                >
                  <IconCheck size={14} className="text-[#C2E600]" />
                  <span>{isQuickConfirming ? 'Approving & Admitting...' : 'Approve Payment & Admit Attendee'}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="p-8 text-center bg-[#FFFFFF] rounded-2xl border border-[#E6E6DF] text-[#8C8C85] text-xs shadow-studio">
              Scan or snap a pass to see real-time entrance verification.
            </div>
          )}

          {/* Recent Scans Log */}
          <div className="p-6 bg-[#FFFFFF] rounded-2xl border border-[#E6E6DF] shadow-studio space-y-4">
            <h2 className="text-sm font-bold text-[#0A0A0A] border-b border-[#E6E6DF] pb-3">
              Session Scan History ({recentScans.length})
            </h2>

            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {recentScans.length === 0 ? (
                <div className="text-xs text-[#8C8C85] text-center py-6">
                  No scans recorded in this session.
                </div>
              ) : (
                recentScans.map((scan, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#FAFAF7] border border-[#E6E6DF] flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-[#0A0A0A]">
                        {scan.attendee?.name || scan.message}
                      </div>
                      <div className="text-[10px] text-[#8C8C85] font-mono">
                        {scan.attendee?.ticketCode || 'Unregistered code'}
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        scan.status === 'VALID'
                          ? 'bg-[#F0FDF4] text-[#10B981] border border-[#10B981]/20'
                          : scan.status === 'ALREADY_CHECKED_IN'
                          ? 'bg-[#FFFBEB] text-[#F59E0B] border border-[#F59E0B]/20'
                          : scan.status === 'PENDING_PAYMENT'
                          ? 'bg-[#FEFCE8] text-[#CA8A04] border border-[#CA8A04]/20'
                          : 'bg-[#FFF5F5] text-[#E53935] border border-[#E53935]/20'
                      }`}
                    >
                      {scan.status === 'PENDING_PAYMENT' ? 'PENDING' : scan.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
