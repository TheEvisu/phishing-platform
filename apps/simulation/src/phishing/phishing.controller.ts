import { Controller, Post, Body, Get, Param, Req, Res, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { PhishingService } from './phishing.service';
import { SendPhishingDto } from '../dto/send-phishing.dto';
import { ClickBeaconDto } from '../dto/click-beacon.dto';

@ApiTags('phishing')
@Controller('phishing')
export class PhishingController {
  constructor(private readonly phishingService: PhishingService) {}

  @ApiOperation({ summary: 'Send a phishing simulation email' })
  @ApiResponse({ status: 201 })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('send')
  async sendPhishing(@Body() sendPhishingDto: SendPhishingDto) {
    return this.phishingService.sendPhishingEmail(sendPhishingDto);
  }


  @ApiOperation({ summary: 'Track click - serves data-collection page, then redirects to training' })
  @ApiParam({ name: 'attemptId', description: 'UUID of the phishing attempt' })
  @Get('click/:attemptId')
  async trackClick(
    @Param('attemptId') attemptId: string,
    @Req()  req: Request,
    @Res()  res: Response,
  ) {
    // Collect server-side data immediately
    await this.phishingService.trackClick(attemptId, req);

    const appUrl      = process.env.APP_URL      || 'http://localhost:3000';
    const trainingUrl = `${process.env.TRAINING_BASE_URL || 'http://localhost:5173/training'}/${attemptId}`;
    const beaconUrl   = `${appUrl}/phishing/beacon/${attemptId}`;

    // Serve tiny intermediate page - data is passed via data-* attributes,
    // script loaded from same origin to satisfy CSP script-src 'self'.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Redirecting...</title>
<style>body{margin:0;background:#fff}</style>
</head>
<body>
<div id="cfg"
  data-beacon=${JSON.stringify(beaconUrl)}
  data-training=${JSON.stringify(trainingUrl)}
></div>
<script src="/phishing/collector.js"></script>
</body>
</html>`);
  }

  @ApiOperation({ summary: 'Client-side fingerprint collector script (CSP-safe, same-origin)' })
  @Get('collector.js')
  serveCollector(@Res() res: Response) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(`(function(){
  var cfg = document.getElementById('cfg');
  if (!cfg) return;
  var t = cfg.getAttribute('data-training');
  var b = cfg.getAttribute('data-beacon');

  function send(d) {
    try {
      var blob = new Blob([JSON.stringify(d)], { type: 'application/json' });
      if (navigator.sendBeacon && navigator.sendBeacon(b, blob)) return;
      fetch(b, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d), keepalive: true }).catch(function(){});
    } catch(e) {}
  }

  function go() { window.location.replace(t); }

  // WebGL - reveals GPU (e.g. "Apple M1")
  var webglVendor = null, webglRenderer = null;
  try {
    var gl = document.createElement('canvas').getContext('webgl') || document.createElement('canvas').getContext('experimental-webgl');
    if (gl) {
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        webglVendor   = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
        webglRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      }
    }
  } catch(e) {}

  // Canvas fingerprint - unique per device/GPU/fonts
  var canvasFingerprint = null;
  try {
    var cc = document.createElement('canvas');
    cc.width = 220; cc.height = 30;
    var ctx = cc.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f0f';
    ctx.fillRect(0, 0, 220, 30);
    ctx.font = '15px Arial';
    ctx.fillStyle = '#069';
    ctx.fillText('Security Awareness Test', 2, 20);
    ctx.fillStyle = 'rgba(100,200,0,0.5)';
    ctx.fillText('Security Awareness Test', 3, 21);
    var raw = cc.toDataURL();
    var h = 0;
    for (var i = 0; i < raw.length; i++) { h = Math.imul(31, h) + raw.charCodeAt(i) | 0; }
    canvasFingerprint = (h >>> 0).toString(16);
  } catch(e) {}

  // Network info
  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  // Plugins
  var plugins = null;
  try {
    var pl = [];
    for (var j = 0; j < Math.min((navigator.plugins || []).length, 10); j++) pl.push(navigator.plugins[j].name);
    if (pl.length) plugins = pl.join(', ');
  } catch(e) {}

  var d = {
    screenResolution:  screen.width + 'x' + screen.height,
    viewportSize:      window.innerWidth + 'x' + window.innerHeight,
    colorDepth:        screen.colorDepth,
    timezone:          (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null),
    language:          navigator.language,
    languages:         (navigator.languages ? Array.prototype.slice.call(navigator.languages, 0, 5).join(',') : navigator.language),
    platform:          navigator.platform,
    cpuCores:          navigator.hardwareConcurrency || null,
    touchSupport:      navigator.maxTouchPoints > 0,
    doNotTrack:        navigator.doNotTrack === '1',
    webglVendor:       webglVendor,
    webglRenderer:     webglRenderer,
    canvasFingerprint: canvasFingerprint,
    deviceMemory:      navigator.deviceMemory || null,
    devicePixelRatio:  window.devicePixelRatio || null,
    connectionType:    conn ? (conn.effectiveType || null) : null,
    connectionDownlink: conn ? (conn.downlink || null) : null,
    connectionRtt:     conn ? (conn.rtt || null) : null,
    plugins:           plugins,
    orientation:       (screen.orientation ? screen.orientation.type : null),
    pdfViewerEnabled:  navigator.pdfViewerEnabled || false,
  };

  // WebRTC local IP - attempt with 800ms timeout, then redirect regardless
  var done = false;
  function finish(localIp) {
    if (done) return;
    done = true;
    if (localIp) d.localIp = localIp;
    send(d);
    go();
  }

  try {
    var pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel('');
    pc.createOffer().then(function(o) { return pc.setLocalDescription(o); }).catch(function() { finish(null); });
    pc.onicecandidate = function(e) {
      if (!e || !e.candidate) return;
      var m = /([0-9]{1,3}\\.){3}[0-9]{1,3}/.exec(e.candidate.candidate);
      if (m && !m[0].startsWith('0.')) { pc.close(); finish(m[0]); }
    };
    setTimeout(function() { try { pc.close(); } catch(e) {} finish(null); }, 800);
  } catch(e) { finish(null); }
})();`);
  }


  @ApiOperation({ summary: 'Receive client-side fingerprint data (called by JS beacon)' })
  @ApiParam({ name: 'attemptId' })
  @ApiResponse({ status: 204 })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Post('beacon/:attemptId')
  async receiveBeacon(
    @Param('attemptId') attemptId: string,
    @Body() dto: ClickBeaconDto,
  ) {
    // Fire-and-forget - don't await, respond immediately to unblock the redirect
    this.phishingService.mergeBeaconData(attemptId, dto).catch(() => undefined);
  }
}
