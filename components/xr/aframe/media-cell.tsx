import AFRAME from 'aframe'
import PropertyMapper from './ComponentUtils'
// import store from '../../../redux/store'
// import { setAppLoaded } from '../../../redux/app/actions'
export const ComponentName = 'media-cell'

export interface MediaCellSystemData {
}
export interface MediaCellSystemProps {
  getSource: (m:any) => string
}
export const MediaCellSystemSchema: AFRAME.Schema<MediaCellSystemData> = {
}

export const MediaCellSystemDef: AFRAME.SystemDefinition<MediaCellSystemProps> = {
  schema: MediaCellSystemSchema,
  data: {
  } as MediaCellSystemData,

  init () {
  },

  play() {
  },

  pause() {
  },
  getSource(media:any): string {
    return media.thumbnailUrl && media.thumbnailUrl.length > 0 ? media.thumbnailUrl : '#placeholder'
  }
}

export interface MediaCellData {
  [key: string]: any,
  active: boolean,
  cellHeight?: number
  cellWidth?: number
  cellContentHeight?: number
  // TODO : media type
  originalTitle: string,
  title: string,
  description: string,
  url: string,
  thumbnailType: string,
  thumbnailUrl: string,
  productionCredit: string,
  rating: string,
  categories: string[],
  runtime: string,
  tags: string[],
  mediatype: string,
  linktype: string,
  sceneLinkPrefix: string,
  videoformat: string,
  clickable: boolean,
  linkEnabled: boolean
}

export const MediaCellComponentSchema: AFRAME.MultiPropertySchema<MediaCellData> = {
  active: { default: true },
  cellHeight: { default: 0.6 },
  cellWidth: { default: 1 },
  cellContentHeight: { default: 0.5 },
  originalTitle: { default: '' },
  title: { default: '' },
  description: { default: '' },
  url: { default: '' }, // TODO: type for url's
  thumbnailType: { default: 'image' },
  thumbnailUrl: { default: '' },
  productionCredit: { default: '' },
  rating: { default: '' },
  categories: { default: [] },
  runtime: { default: '' },
  tags: { default: [] },
  mediatype: { default: 'video360' },
  linktype: { default: 'internal' },
  sceneLinkPrefix: { default: 'vrRoom' },
  videoformat: { default: 'eac' },
  clickable: { default: true },
  linkEnabled: { default: true }
}

export interface MediaCellProps {
  initCell: () => void,
  initCellCB: () => void,
  createCell: () => AFRAME.Entity,
  enableLink: (el: any) => void
}

export const MediaCellComponent: AFRAME.ComponentDefinition<MediaCellProps> = {
  schema: MediaCellComponentSchema,
  data: {
  } as MediaCellData,

  init () {
    this.initCellCB()
  },

  play() {
  },

  pause() {
  },

  update(oldData: MediaCellData) {
    const changedData = Object.keys(this.data).filter(x => this.data[x] !== oldData[x])
    if (changedData.includes('active')) {
      this.el.setAttribute('grid-cell', { active: this.data.active })
      if (this.data.active) {
        this.initCellCB()
      } else {
        while (this.el.firstChild) {
          this.el.removeChild((this.el as any).lastChild)
        }
      }
    }
  },

  initCellCB () {
    if (this.el.sceneEl?.hasLoaded) this.initCell()
    else this.el.sceneEl?.addEventListener('loaded', this.initCell.bind(this))
  },

  initCell() {
    const active = (this.el.components['grid-cell'] as any).data.active
    if (active) this.el.appendChild(this.createCell())
  },

  createCell() {
    switch (this.data.thumbnailType) {
      case 'model': {
        const objEl = document.createElement('a-gltf-model')
        const source = (this.system as AFRAME.SystemDefinition<MediaCellSystemProps>).getSource(this.data)
        objEl.setAttribute('src', source)
        if (this.data.clickable) objEl.classList.add('clickable')

        if (this.data.linkEnabled) this.enableLink(objEl)

        return objEl
      }
      case 'image': {
        const imageEl = document.createElement('a-image')
        const source = (this.system as AFRAME.SystemDefinition<MediaCellSystemProps>).getSource(this.data)
        imageEl.setAttribute('src', source)
        imageEl.setAttribute('width', this.data.cellWidth)
        imageEl.setAttribute('height', this.data.cellContentHeight)
        imageEl.setAttribute('side', 'double')
        if (this.data.clickable) imageEl.classList.add('clickable')
        if (this.data.linkEnabled) this.enableLink(imageEl)

        return imageEl
      }
      default: {
        return document.createElement('a-entity')
      }
    }
  },

  enableLink(el: any) {
    if (this.data.clickable) el.classList.add('clickable')
    let url: string
    switch (this.data.linktype) {
      case 'external':
        url = 'https://'
        break
      case 'internal':
      default:
        url = ''
        break
    }
    switch (this.data.mediatype) {
      case 'video360':
        url += 'video360?manifest=' + this.data.url +
          '&title=' + this.data.title +
          '&runtime=' + this.data.runtime +
          '&credit=' + this.data.productionCredit +
          '&rating=' + this.data.rating +
          (Array.isArray(this.data.categories) ? '&categories=' + this.data.categories.join(', ') : this.data.categories.toString()) +
          // '&tags=' + this.data.tags.join(',') +
          '&videoformat=' + this.data.videoformat
        break
      case 'scene':
        url += this.data.sceneLinkPrefix + '-scene?url=' + this.data.url
        break
      case 'landing':
        url += this.data.url
        break
      default:
        url += ''
        break
    }
    // handle navigate on the react side - this emits the 'navigate' event when .clickable is clicked
    // and passes the url data through
    el.setAttribute('clickable', { clickevent: 'navigate', clickeventData: JSON.stringify({ url }) })
  }
}

const primitiveProps = [
  'id',
  'cellHeight',
  'cellWidth',
  'cellContentHeight',
  'originalTitle',
  'title',
  'description',
  'thumbnailUrl',
  'productionCredit',
  'rating',
  'categories',
  'runtime',
  'tags',
  'mediatype',
  'linktype',
  'sceneLinkPrefix',
  'videoformat',
  'clickable',
  'linkEnabled',
  'thumbnailType'
]
export const MediaCellPrimitive: AFRAME.PrimitiveDefinition = {
  defaultComponents: {
    ComponentName: {},
    'grid-cell': {}
  },
  deprecated: false,
  mappings: {
    ...PropertyMapper(primitiveProps, ComponentName),
    'media-url': ComponentName + '.' + 'url',
    active: 'grid-cell.active'
  }
}

const ComponentSystem = {
  name: ComponentName,
  system: MediaCellSystemDef,
  component: MediaCellComponent,
  primitive: MediaCellPrimitive
}

export default ComponentSystem
