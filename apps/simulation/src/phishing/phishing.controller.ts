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

  // ─── Click tracking ────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Track click — serves data-collection page, then redirects to training' })
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

    // Serve tiny intermediate page — collects client-side fingerprint,
    // fires sendBeacon (fire-and-forget), then immediately redirects.
    // The user sees no content — just a brief blank page.
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
<script>
(function(){
  var t = ${JSON.stringify(trainingUrl)};
  var b = ${JSON.stringify(beaconUrl)};
  var d = {
    screenResolution: screen.width + 'x' + screen.height,
    viewportSize:     window.innerWidth + 'x' + window.innerHeight,
    colorDepth:       screen.colorDepth,
    timezone:         (Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : null),
    language:         navigator.language,
    languages:        (navigator.languages ? Array.from(navigator.languages).slice(0,5).join(',') : navigator.language),
    platform:         navigator.platform,
    cpuCores:         navigator.hardwareConcurrency || null,
    touchSupport:     navigator.maxTouchPoints > 0,
    doNotTrack:       navigator.doNotTrack === '1',
  };
  function go(){ window.location.replace(t); }
  try {
    var blob = new Blob([JSON.stringify(d)], { type: 'application/json' });
    if (navigator.sendBeacon && navigator.sendBeacon(b, blob)) { go(); }
    else {
      fetch(b, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d), keepalive:true })
        .finally(go);
    }
  } catch(e) { go(); }
})();
</script>
</body>
</html>`);
  }

  // ─── Client-side beacon ────────────────────────────────────────────────────

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
    // Fire-and-forget — don't await, respond immediately to unblock the redirect
    this.phishingService.mergeBeaconData(attemptId, dto).catch(() => undefined);
  }
}
