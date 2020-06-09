import { useEffect } from 'react'
import { Component, System, World } from 'ecsy'
import { connect } from 'react-redux'
import {
  initialize,
  Parent,
  Transform,
  Object3D
} from 'ecsy-three'
import * as THREE from 'three'
import { selectAuthState } from '../../redux/auth/selector'
import addEntityInstance from '../../apollo/mutations/entity-instance/add-entity-instance.gql'
import findComponentInstances from '../../apollo/mutations/component-instance/find-component-instances.gql'
import addComponentInstance from '../../apollo/mutations/component-instance/add-component-instance.gql'
import patchComponentInstance from '../../apollo/mutations/component-instance/patch-component-instance.gql'
import client from '../../utils/apollo-client'
import { v4 } from 'uuid'
import findEntityInstances from '../../apollo/mutations/entity-instance/find-entity-instances.gql'
import entityInstanceCreated from '../../apollo/subscriptions/entity-instance/entity-instance-created.gql'
import componentInstancePatched from '../../apollo/subscriptions/component-instance/component-instance-patched.gql'
import componentInstanceCreated from '../../apollo/subscriptions/component-instance/component-instance-created.gql'

// This React component is an example of how to create an ecsy-three entity with components, animate it, store the
// entity and components in the realtime store via GraphQL, and update some components as they change.
// The component 'listener-example' demonstrates getting values from a subscription and updating an entity/component
// using those values.

const entityMap = new Map()
const componentMap = new Map()

// eslint-disable-next-line react/prefer-stateless-function
class Rotating extends Component {}

// eslint-disable-next-line react/prefer-stateless-function
class Movable extends Component {}

// This is included only on Components that will be saved to the realtime store (may not be best practice)
// In this example, both the camera and the box representing the user are moved simultaneously, but we don't
// want anyone else knowing about the camera, just the box.
// eslint-disable-next-line react/prefer-stateless-function
class Networked extends Component {}

// This is included on entities that the user has created, so their GQL subscription updates can be ignored
// eslint-disable-next-line react/prefer-stateless-function
class Owned extends Component {}

// According to the ECSY documentation, entities and components should be modified from systems.
// You could probably modify them elsewhere, but this seems to be the most accepted and scoped place.
class RotationSystem extends System {
  // execute runs every frame. delta is the amount of time since the last call to execute.
  execute(delta) {
    // queries.X.results gets everything that matches that result.
    // queries.X.changed gets only the entities that have changed.
    // There's also queries.X.added and queries.X.removed.
    this.queries.entities.results.forEach(entity => {
      // entity.getComponent will get a component in a read-only state. If you want to modify it, you must
      // use .getMutableComponent
      const rotation = (entity.getMutableComponent(Transform) as any).rotation
      rotation.x += 0.5 * delta
      rotation.y += 0.1 * delta
    })
  }
}

class MovementSystem extends System {
  execute() {
    this.queries.entities.results.forEach(entity => {
      const ownedComponent = entity.getComponent(Owned)
      // Only update components that others have created; our own components will be updated locally
      if (ownedComponent == null) {
        const transformComponent = entity.getMutableComponent(Transform)
        const mappedComponent = componentMap.get((transformComponent as any).uuid)
        if (mappedComponent) {
          (transformComponent as any).position = mappedComponent.position;
          (transformComponent as any).rotation = mappedComponent.rotation
        }
      }
    })

    this.queries.entities.changed.forEach(entity => {
      const transformComponent = entity.getComponent(Transform)
      const networkedComponent = entity.getComponent(Networked)
      const ownedComponent = entity.getComponent(Owned)

      // Only patch components that this user controls and on entities that we want others to subscribe to.
      if (networkedComponent != null && ownedComponent != null) {
        client.mutate({
          mutation: patchComponentInstance,
          variables: {
            id: (transformComponent as any).uuid,
            data: JSON.stringify(transformComponent)
          }
        })
      }
    })
  }
}

const entityInstanceCreatedSubscription = client.subscribe({
  query: entityInstanceCreated
})

const componentInstancePatchedSubscription = client.subscribe({
  query: componentInstancePatched
})

const componentInstanceCreatedSubscription = client.subscribe({
  query: componentInstanceCreated
})

// This is how you set which entities you want to attach a system to (you can also set it inside the system by
// using this.queries = {<blah>})
RotationSystem.queries = {
  entities: {
    components: [Rotating, Transform],
    listen: {
      changed: [Transform]
    }
  }
}

MovementSystem.queries = {
  entities: {
    components: [Movable, Transform],
    listen: {
      changed: [Transform]
    }
  }
}

interface Props {
  auth: any
}

const mapStateToProps = (state: any) => {
  return {
    auth: selectAuthState(state)
  }
}

const mapDispatchToProps = () => ({
})

// This adds a newly-created foreign component to the componentMap, then attaches it to the parent entity.
// It was broken out into a separate named function so that it could be called recursively from setTimeout in case
// the parent entity isn't in the store
function addComponent(data) {
  const createdComponent = data.data.componentInstanceCreated
  if (typeof createdComponent.data === 'string') {
    createdComponent.data = JSON.parse(createdComponent.data)
  }
  const existingComponent = componentMap.get(createdComponent.id)
  // Skip components that already exist
  if (existingComponent == null) {
    const parentEntity = entityMap.get(createdComponent.entityId)
    // (May not be necessary) If the newly-created component's parent entity isn't in the entityMap, wait one second
    // and try again
    if (parentEntity == null) {
      setTimeout(() => addComponent(data), 1000)
    } else {
      // Just a hacky way to ignore the Rotation component that's being saved/retrieved
      if (createdComponent.data.rotation) {
        componentMap.set(createdComponent.id, createdComponent.data)
        parentEntity.addComponent(Transform, componentMap.get(createdComponent.id));
        (parentEntity.getComponent(Transform) as any).uuid = createdComponent.data.uuid
        entityMap.set(parentEntity.id, parentEntity)
      }
    }
  }
}

async function init(auth: any) {
  let lastTime = 0
  // Create a new world to hold all our entities and systems
  const world = new World()

  // Initialize the default sets of entities and systems
  const data = initialize(world)
  world.registerSystem(RotationSystem)

  // Grab the initialized entities
  const { scene, camera } = data.entities

  camera.id = v4()
  // Modify the position for the default camera
  const transform = camera.getMutableComponent(Transform)
  transform.position.z = 40
  transform.uuid = v4()

  const texture = new THREE.TextureLoader().load('../../textures/crate.gif')
  const geometry = new THREE.BoxBufferGeometry(20, 20, 20)
  const material = new THREE.MeshBasicMaterial({ map: texture })
  const mesh = new THREE.Mesh(geometry, material)

  // Create a fixed rotating box for spatial orientation purposes. The rotation distinguishes it from the user
  // boxes, which do not rotate
  const fixedBox = world.createEntity()
    .addComponent(Object3D, { value: mesh })
    .addComponent(Transform)
    .addComponent(Parent, { value: scene })
    .addComponent(Rotating)

  // Learning from something surmised in the original example, it's fine to overwrite the entity's ID with a UUID.
  fixedBox.id = v4()

  // The camera should be moved by button presses
  // Without knowing better how three.js cameras work, though, we're not assigning a mesh Object3D to the camera;
  // that seemed to be throwing errors. The box representing the user is a separate entity that just happens to share
  // the coordinates of the camera.
  camera
    .addComponent(Movable)
    .addComponent(Parent, { value: scene })

  const authUser = auth.get('authUser')

  if (authUser != null && authUser.accessToken && authUser.accessToken.length > 0) {
    try {
      // Each box needs its own mesh instantiation
      const mesh = new THREE.Mesh(geometry, material)
      // The box representing the user is networked, meaning we'll send updates about it to the realtime server;
      // is movable, meaning it will have its position updated; and owned, meaning this user owns it and it should
      // not be updated from subscribed data
      const userBox = world.createEntity()
        .addComponent(Object3D, { value: mesh })
        .addComponent(Transform)
        .addComponent(Parent, { value: scene })
        .addComponent(Networked)
        .addComponent(Movable)
        .addComponent(Owned)
      // .addComponent(Rotating)
      userBox.id = v4()

      const userBoxTransform = (userBox as any).getMutableComponent(Transform);
      (userBoxTransform as any).position.z = 40;
      (userBoxTransform as any).uuid = v4()

      await client.mutate(({
        mutation: addEntityInstance,
        variables: {
          id: userBox.id,
          name: 'User Entity ' + authUser.id
        }
      }))

      entityMap.set(camera.id, camera)
      entityMap.set(userBox.id, userBox)

      await client.mutate({
        mutation: addComponentInstance,
        variables: {
          id: (userBoxTransform as any).uuid,
          data: JSON.stringify(userBoxTransform),
          entityId: userBox.id
        }
      })

      componentMap.set((userBoxTransform as any).uuid, userBoxTransform)

      // Left/right/up/down arrows move the user box and the camera
      document.onkeydown = (e) => {
        const cameraTransform = camera.getMutableComponent(Transform)
        const userBoxTransform = (userBox as any).getMutableComponent(Transform)
        switch (e.keyCode) {
          case 37:
            cameraTransform.position.x -= 0.5
            userBoxTransform.position.x -= 0.5
            break
          case 38:
            cameraTransform.position.z -= 0.5
            userBoxTransform.position.z -= 0.5
            break
          case 39:
            cameraTransform.position.x += 0.5
            userBoxTransform.position.x += 0.5
            break
          case 40:
            cameraTransform.position.z += 0.5
            userBoxTransform.position.z += 0.5
            break
        }
      }

      entityMap.set(fixedBox.id, fixedBox)

      const entityResult = await client.mutate({
        mutation: findEntityInstances
      })

      const existingEntities = entityResult.data.findEntityInstances

      const componentResult = await client.mutate({
        mutation: findComponentInstances
      })

      const existingComponents = componentResult.data.findComponentInstances

      existingEntities.forEach(async (entity: any) => {
        // Create an entity here for all those that are already in the store but not present locally
        // We're assuming the only entities being saved in the realtime store are user 'avatar' boxes
        if (entityMap.get(entity.id) == null) {
          // Get the entity's child components
          const childComponents = existingComponents.filter((component) => {
            return component.entityId === entity.id
          })

          const mesh = new THREE.Mesh(geometry, material)
          const otherUserBox = world.createEntity(entity.id)
            .addComponent(Object3D, { value: mesh })
            .addComponent(Parent, { value: scene })
            .addComponent(Movable)

          childComponents.forEach((component) => {
            // data is sent and stored as stringified JSON, so we need to parse it back into JSON
            component.data = JSON.parse(component.data)
            // Just a hacky way to ignore the Rotation component that's being saved/retrieved
            if (component.data.rotation) {
              componentMap.set(component.id, component.data)
              otherUserBox.addComponent(Transform, componentMap.get(component.id));
              (otherUserBox.getComponent(Transform) as any).uuid = component.data.uuid
            }
          })

          entityMap.set(entity.id, otherUserBox)
        }
      })

      // Listen for component patches and update their values
      componentInstancePatchedSubscription.subscribe({
        next(data) {
          const updatedComponent = data.data.componentInstancePatched
          if (typeof updatedComponent.data === 'string') {
            updatedComponent.data = JSON.parse(updatedComponent.data)
          }
          const existingComponent = componentMap.get(updatedComponent.id)
          if (existingComponent != null && updatedComponent.id !== (userBox as any).getComponent(Transform).uuid) {
            componentMap.set(updatedComponent.id, updatedComponent.data)
          }
        }
      })

      // Listen for components being created and add them to the local cache. The function that's called will pause and
      // call itself if the parent entity doesn't exist locally
      componentInstanceCreatedSubscription.subscribe({
        next(data) {
          addComponent(data)
        }
      })

      // Listen for entities being created and add them to the local cache.
      entityInstanceCreatedSubscription.subscribe({
        next(data) {
          const createdEntity = data.data.entityInstanceCreated
          const existingEntity = entityMap.get(createdEntity.id)
          if (existingEntity == null && createdEntity.id !== userBox.id) {
            const mesh = new THREE.Mesh(geometry, material)
            const otherUserBox = world.createEntity()
              .addComponent(Object3D, { value: mesh })
              .addComponent(Parent, { value: scene })
              .addComponent(Movable)

            otherUserBox.id = createdEntity.id

            entityMap.set(createdEntity.id, otherUserBox)
          }
        }
      })
      // Let's begin
      const time = performance.now()
      const delta = time - lastTime
      world.registerSystem(MovementSystem)
      world.execute(delta, time)
      lastTime = time
    } catch (err) {
      console.log(err)
    }
  }
}

const EcsyComponent = (props: Props) => {
  useEffect(() => {
    const { auth } = props
    init(auth)
  }, [])

  return (<div/>)
}

const EcsyComponentWrapper = (props: any) => {
  return <EcsyComponent {...props} />
}

export default connect(mapStateToProps, mapDispatchToProps)(EcsyComponentWrapper)
