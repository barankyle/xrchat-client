import { connect } from 'react-redux'
import { selectDeviceDetectState } from '../../../redux/devicedetect/selector'

import getConfig from 'next/config'
const config = getConfig().publicRuntimeConfig.xr.enterVRbutton

function SvgVr(props) {
  const isDeviceDetected = props.detectedDevice.get('isDetected')
  const deviceDetectedInfo = props.detectedDevice.get('content')
  const deviceOS = deviceDetectedInfo.device.os.name
  const isWebXRSupported = deviceDetectedInfo.WebXRSupported

  const EntevVRIcon = (src) => {
    let icon
    if (src !== '') {
      icon = <img src={src}
        style={ { zIndex: 99999, position: 'fixed', display: 'block', width: '6em', height: '4em' } }/>
    } else {
      icon = <svg viewBox="0 0 62.7 52.375" width="1em" height="1em" {...props}>
        <path
          d="M53.4 9.92h-44c-2.1 0-3.7 1.7-3.7 3.7v22.6c0 2.1 1.7 3.7 3.7 3.7h13.4c1.1 0 2.1-.6 2.5-1.6l3-7.5c1.2-2.6 4.9-2.5 6 .1l2.6 7.3c.4 1 1.4 1.7 2.5 1.7h13.9c2.1 0 3.7-1.7 3.7-3.7v-22.5c.2-2.1-1.5-3.8-3.6-3.8zm-33 21.5c-3.2 0-5.7-2.6-5.7-5.7s2.6-5.7 5.7-5.7 5.7 2.6 5.7 5.7-2.5 5.7-5.7 5.7zm22 0c-3.2 0-5.7-2.6-5.7-5.7s2.6-5.7 5.7-5.7 5.7 2.6 5.7 5.7-2.5 5.7-5.7 5.7z"
          fill="#fff"
          fillOpacity={0.956}
          opacity={0.5}
        />
      </svg>
    }
    return (
      icon
    )
  }

  const buttonType = () => {
    let template = null
    if (isDeviceDetected) {
      if (deviceOS === 'iOS') {
        template = EntevVRIcon(config.iOSsrc || config.src)
      } else if (deviceOS === 'Android') {
        template = EntevVRIcon(config.AndroidSrc || config.src)
      } else if (deviceDetectedInfo.device.device.type === 'desktop') {
        if (!isWebXRSupported) {
          template = EntevVRIcon(config.noWebXRsrc || config.src)
        } else {
          template = EntevVRIcon(config.src)
        }
      }
    }
    return template
  }

  return (
    buttonType()
  )
}

const mapStateToProps = (state) => {
  return {
    detectedDevice: selectDeviceDetectState(state)
  }
}

export default connect(mapStateToProps)(SvgVr)
