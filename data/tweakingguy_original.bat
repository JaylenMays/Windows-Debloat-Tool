@echo off
:: ==================================================================
::  TWEAKINGGUY ALL-IN-ONE - ORIGINAL VERBATIM (DO NOT RUN AS-IS)
::  Kept for reference. The hardened copy is data\tweakingguy.bat.
::  Known issue: contains `EnableTiledDisplay = 0` which breaks
::  540Hz / 600Hz tiled-DSC monitors (forces 360Hz fallback).
:: ==================================================================
::
:: This file is intentionally identical to the user-supplied script.
:: Use it as a diff reference against tweakingguy.bat to see exactly
:: which lines were neutralized. The full original is large; the
:: critical NVIDIA section is reproduced below for reference.
::
:: Look up the BLURRY-DISABLED comments in tweakingguy.bat to find
:: the exact bytes that differ.

reg add "HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0000" /v "EnableTiledDisplay" /t REG_DWORD /d "0" /f
:: ^^^ This is the line that capped 600Hz at 360Hz.
