"use client"
import MotorTestPanel from './MotorTestPanel'

export default function Controller(){
  return <>
    <h1 className="page-title">Fabricut Controller</h1>
    <p className="notice">Upload a pattern below, preview the toolpath on the {444.5}×{650} mm work area, then stream G-code to the ESP32 stepper plotter over Web Serial (approved staff/owners only).</p>
    <MotorTestPanel/>
  </>
}
