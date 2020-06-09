import AFRAME from 'aframe'
import PropertyMapper from './ComponentUtils'

const THREE = AFRAME.THREE

export const ComponentName = 'fuse-instructions'

export interface SystemData {
  value: boolean,
  height: number,
  width: number,
  bgColor: string
}

export const SystemSchema: AFRAME.Schema<SystemData> = {
  value: { default: true },
  height: { default: 1 },
  width: { default: 2 },
  bgColor: { default: 'black' }
}

export interface SystemProps {
  enterVRHandler: () => void,
  createInstructions: () => AFRAME.Entity,
  dismissHandler: () => void,
  instructionsEl: AFRAME.Entity,
  hasBeenDisplayed: boolean
}

export const SystemDef: AFRAME.SystemDefinition<SystemProps> = {
  schema: SystemSchema,
  data: {
  } as SystemData,

  hasBeenDisplayed: false,
  instructionsEl: null,

  init () {
    this.createInstructions = this.createInstructions.bind(this)
    this.enterVRHandler = this.enterVRHandler.bind(this)
    this.dismissHandler = this.dismissHandler.bind(this)
  },

  createInstructions() {
    const instructionsEntity = document.createElement('a-entity')
    const textEntity = document.createElement('a-entity')

    const text =
    `
    Hover cursor over a button.
    The cursor will change red and begin fusing.
    The cursor will gradualy shrink.
    After 4 seconds, the hovered button will be clicked.
    Move the cursor away before the fuse completes to prevent clicking.
    `

    textEntity.setAttribute('text-cell', {
      font: 'roboto',
      width: this.data.width,
      height: this.data.height,
      align: 'center',
      baseline: 'center',
      color: '#FFF',
      transparent: false,
      fontsize: 3,
      text: text,
      wrapcount: 45,
      anchor: 'center'
    })

    const bg = document.createElement('a-plane')
    bg.setAttribute('color', this.data.bgColor)
    bg.setAttribute('width', this.data.width)
    bg.setAttribute('height', this.data.height)

    bg.object3D.position.set(0, 0, -0.01)

    // Dismiss button
    const btnTextEntity = document.createElement('a-entity')
    btnTextEntity.setAttribute('text-cell', {
      font: 'roboto',
      width: this.data.width / 3,
      height: this.data.height / 5,
      align: 'center',
      baseline: 'center',
      color: '#FFF',
      transparent: false,
      fontsize: 7,
      text: 'Dismiss',
      wrapcount: 10,
      anchor: 'right'
    })
    btnTextEntity.object3D.position.set(this.data.width / 6, -this.data.height * 1.4 / 5, 0.01)

    const btnBG = document.createElement('a-plane')
    btnBG.setAttribute('color', 'blue')
    btnBG.setAttribute('width', this.data.width / 3)
    btnBG.setAttribute('height', this.data.height / 5)

    btnBG.object3D.position.set(-this.data.width / 6, 0, -0.01)
    btnBG.classList.add('clickable')
    btnBG.setAttribute('clickable', { clickevent: 'dismiss-fuse-instructions' })
    btnBG.addEventListener('dismiss-fuse-instructions', this.dismissHandler.bind(this))

    btnTextEntity.appendChild(btnBG)

    instructionsEntity.appendChild(textEntity)
    instructionsEntity.appendChild(bg)
    instructionsEntity.appendChild(btnTextEntity)

    return instructionsEntity
  },

  enterVRHandler() {
    if (this.hasBeenDisplayed) return
    const instructionsEl = this.createInstructions()

    const camera = this.el.camera
    const pos = new THREE.Vector3()
    camera.getWorldPosition(pos)

    instructionsEl.object3D.position.set(pos.x, pos.y, pos.z - 1)

    this.el.appendChild(instructionsEl)
    this.instructionsEl = instructionsEl
    this.hasBeenDisplayed = true
  },

  dismissHandler() {
    if (!this.instructionsEl) return

    this.instructionsEl.parentEl.removeChild(this.instructionsEl)
  }
}

export interface Data {
  [key: string]: any,
  value: boolean,
}

export const ComponentSchema: AFRAME.MultiPropertySchema<Data> = {
  value: { default: true }
}

export interface Props {
  addHandlers: () => void,
  removeHandlers: () => void
}

export const Component: AFRAME.ComponentDefinition<Props> = {
  schema: ComponentSchema,
  data: {
  } as Data,

  init () {
  },

  play() {
    this.addHandlers()
  },

  pause() {
    this.removeHandlers()
  },

  addHandlers: function() {
    this.el.sceneEl.addEventListener('enter-vr', this.system.enterVRHandler, { once: true })
  },

  removeHandlers: function() {
    this.el.sceneEl.removeEventListener('enter-vr', this.system.enterVRHandler)
  }

}

const primitiveProps = ['value']

export const Primitive: AFRAME.PrimitiveDefinition = {
  defaultComponents: {
    ComponentName: {}
  },
  deprecated: false,
  mappings: {
    ...PropertyMapper(primitiveProps, ComponentName)
  }
}

const ComponentSystem = {
  name: ComponentName,
  system: SystemDef,
  component: Component,
  primitive: Primitive
}

export default ComponentSystem
