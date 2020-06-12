import { useEffect } from 'react'
import { Component, System } from 'ecsy'
import { connect } from 'react-redux'
import {
  initialize,
  Object3DComponent,
  Position,
  ECSYThreeWorld
} from 'ecsy-three'
import * as THREE from 'three'
import { selectAuthState } from '../../redux/auth/selector'
import addEntityInstance from '../../apollo/mutations/entity-instance/add-entity-instance.gql'
import findEntityInstances from '../../apollo/mutations/entity-instance/find-entity-instances.gql'
import removeEntityInstance from '../../apollo/mutations/entity-instance/remove-entity-instance.gql'
import entityInstanceCreated from '../../apollo/subscriptions/entity-instance/entity-instance-created.gql'
import entityInstanceRemoved from '../../apollo/subscriptions/entity-instance/entity-instance-removed.gql'
import findComponentInstances from '../../apollo/mutations/component-instance/find-component-instances.gql'
import addComponentInstance from '../../apollo/mutations/component-instance/add-component-instance.gql'
import patchComponentInstance from '../../apollo/mutations/component-instance/patch-component-instance.gql'
import removeComponentInstance from '../../apollo/mutations/component-instance/remove-component-instance.gql'
import client from '../../utils/apollo-client'
import { v4 } from 'uuid'
import componentInstancePatched from '../../apollo/subscriptions/component-instance/component-instance-patched.gql'
import componentInstanceCreated from '../../apollo/subscriptions/component-instance/component-instance-created.gql'
import componentInstanceRemoved from '../../apollo/subscriptions/component-instance/component-instance-removed.gql'
import addUserInstance from '../../apollo/mutations/user-instance/add-user-instance.gql'
import findUserInstances from '../../apollo/mutations/user-instance/find-user-instances.gql'
import removeUserInstance from '../../apollo/mutations/user-instance/remove-user-instance.gql'
import userInstanceCreated from '../../apollo/subscriptions/user-instance/user-instance-created.gql'
import userInstanceRemoved from '../../apollo/subscriptions/user-instance/user-instance-removed.gql'

// This React component demonstrates how to handle networked ecsy-three components controlled by users.
// There's a rotating box at the center of the room that's controlled by no one.
// When someone enters the room, there's a camera and stationary box created for them at (0,0,40).
// The box entity is saved to the realtime store, as is its Position component.
// When the user presses the arrow keys, their camera and box move. The position component of the box is updated
// in the realtime store.
// There are subscriptions for entities being created and removed; components being created, patched, and removed;
// and users being created and removed. When a user box is moved, other users in the room will updated that user's box
// position from the Position component patched subscription returning the new position.
// When a user closes or refreshes their window, all of their networked entities and components will be removed,
// so the other users' windows will be notified and remove the user's box accordingly.

const entityMap = new Map()
const componentMap = new Map()
const userMap = new Map()

// eslint-disable-next-line react/prefer-stateless-function
class Rotating extends Component {}

// eslint-disable-next-line react/prefer-stateless-function
class Movable extends Component {}

// This is included only on Components that will be saved to the realtime store (may not be best practice)
// In this example, both the camera and the box representing the user are moved simultaneously, but we don't
// want anyone else knowing about the camera, just the box.
// eslint-disable-next-line react/prefer-stateless-function
class Networked extends Component {}

// This is included on entities that the user has created
// Within something like the MovementSystem, this lets us easily distinguish between entities that are under the user's
// control and entities that are controlled by others
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
      const rotation = (entity.getMutableComponent(Object3DComponent) as any).value.rotation
      rotation.x += 0.5 * delta
      rotation.y += 0.1 * delta
    })
  }
}

// This system is attached to objects that we want to move
// It is not attached to the rotating box, so that will not be affected by any of the logic here.
class MovementSystem extends System {
  execute() {
    this.queries.entities.results.forEach(entity => {
      const ownedComponent = entity.getComponent(Owned)
      // Only update components that others have created; our own components will be updated locally
      if (ownedComponent == null) {
        // In a prior version of ecsy-three the 'Transform' component had a system to automatically update
        // Object3D's position and rotation when they were changed on Transform; if this isn't brought back for
        // the Position component, it may be worthwhile to write it for Position so you don't have to update that
        // and then update the Object3D position from it
        const positionComponent = (entity.getMutableComponent(Position) as any).value
        const object3dComponent = (entity.getMutableComponent(Object3DComponent) as any).value
        const mappedComponent = componentMap.get((positionComponent as any).uuid)
        if (mappedComponent && (entity as any).alive) {
          // Many components seem to have a .copy function that will update all of the relevant fields for you.
          positionComponent.copy(mappedComponent)
          object3dComponent.position.copy(mappedComponent)
        }
      }
    })

    this.queries.entities.changed.forEach(entity => {
      const positionComponent = (entity.getComponent(Position) as any).value
      const networkedComponent = entity.getComponent(Networked)
      const ownedComponent = entity.getComponent(Owned)

      // Only patch components that this user controls and on entities that we want others to subscribe to.
      if (networkedComponent != null && ownedComponent != null) {
        client.mutate({
          mutation: patchComponentInstance,
          variables: {
            id: positionComponent.uuid,
            data: JSON.stringify(positionComponent)
          }
        })
      }
    })
  }
}

// Initialize all of the subscriptions.
// The handlers for what to do with the data that's returned is near the bottom of the init function.
const entityInstanceCreatedSubscription = client.subscribe({
  query: entityInstanceCreated
})

const componentInstancePatchedSubscription = client.subscribe({
  query: componentInstancePatched
})

const componentInstanceCreatedSubscription = client.subscribe({
  query: componentInstanceCreated
})

const userInstanceCreatedSubscription = client.subscribe({
  query: userInstanceCreated
})

const userInstanceRemovedSubscription = client.subscribe({
  query: userInstanceRemoved
})

const entityInstanceRemovedSubscription = client.subscribe({
  query: entityInstanceRemoved
})

const componentInstanceRemovedSubscription = client.subscribe({
  query: componentInstanceRemoved
})

// This is how you set which entities you want to attach a system to (you can also set it inside the system by
// using this.queries = {<blah>})
// components is a list of Components; if an entity has all of those Components, then the system will affect it.
// If it's missing at least one of those Components, it will be ignored by that system.
// listen.changed/removed/added will apply only to changes/additions/removals of those types of Components
RotationSystem.queries = {
  entities: {
    components: [Rotating, Object3DComponent],
    listen: {
      changed: [Object3DComponent]
    }
  }
}

MovementSystem.queries = {
  entities: {
    components: [Movable, Position],
    listen: {
      changed: [Position]
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

const texture = new THREE.TextureLoader().load('../../textures/crate.gif')
const geometry = new THREE.BoxBufferGeometry(20, 20, 20)
const material = new THREE.MeshBasicMaterial({ map: texture })

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
      // This all assumes that the only component data being added is Position. That will obviously not be the case
      // in a real scene, and we'll need to have some way of telling what type of component it is saved to the
      // realtime store
      // This is also assumnig that there's already an Object3DComponent and Position on the foreign entity, since we're
      // instantiating all foreign entities with an Object3DComponent down below (and that automatically creates a
      // Position component on the entity)
      componentMap.set(createdComponent.id, createdComponent.data)
      const boxPositionComponent = parentEntity.getMutableComponent(Position).value
      const box3dObjectComponent = parentEntity.getMutableComponent(Object3DComponent).value
      boxPositionComponent.copy(createdComponent.data)
      // These nonstandard fields need to be manually set, as Vector.copy only copies x/y/z
      boxPositionComponent.uuid = createdComponent.id
      boxPositionComponent.userId = createdComponent.userId
      box3dObjectComponent.position.copy(boxPositionComponent)
    }
  }
}

async function init(auth: any) {
  let lastTime = 0
  // Create a new world to hold all our entities and systems
  const world = new ECSYThreeWorld()

  // Initialize the default sets of entities and systems
  const data = initialize(world)
  world.registerSystem(RotationSystem)

  // Grab the initialized entities
  const { scene, camera } = data.entities

  camera.id = v4()
  // Modify the position for the default camera
  const cameraPositionComponent = camera.getMutableComponent(Position).value
  const camera3dObjectComponent = camera.getMutableComponent(Object3DComponent).value
  cameraPositionComponent.z = 40
  camera3dObjectComponent.position.copy(cameraPositionComponent)
  cameraPositionComponent.uuid = v4()

  // Create a fixed rotating box for spatial orientation purposes. The rotation distinguishes it from the user
  // boxes, which do not rotate
  const mesh = new THREE.Mesh(geometry, material)
  const fixedBox = world.createEntity()
    .addObject3DComponents(mesh, scene)
    .addComponent(Rotating)

  entityMap.set(fixedBox.id, fixedBox)

  // Learning from something surmised in the original example, it's fine to overwrite an entity's ID with a UUID.
  fixedBox.id = v4()

  // The camera should be moved by button presses
  // Without knowing better how three.js cameras work, though, we're not assigning a mesh Object3DComponent to the
  // camera; that seemed to be throwing errors. The box representing the user is a separate entity that just happens to
  // share the coordinates of the camera.
  camera
    .addComponent(Movable)
    .addComponent(Owned)

  const authUser = auth.get('authUser')
  const user = auth.get('user')

  if (authUser != null && authUser.accessToken && authUser.accessToken.length > 0) {
    try {
      // Add the user to the realtime store.
      // The mutation grabs the user's ID from their authentication, so no need to pass any variables.
      await client.mutate({
        mutation: addUserInstance
      })

      userMap.set(user.id, user)
      // Each box needs its own mesh instantiation
      const mesh = new THREE.Mesh(geometry, material)
      // The box representing the user is networked, meaning we'll send updates about it to the realtime server;
      // is movable, meaning it will have its position updated; and owned, meaning this user owns it and it should
      // not be updated from subscribed data
      const userBox = world.createEntity()
        .addObject3DComponents(mesh, scene)
        .addComponent(Networked)
        .addComponent(Movable)
        .addComponent(Owned)
      userBox.id = v4();
      (userBox as any).userId = user.id

      // Set the initial position of the user's box.
      const userBoxPositionComponent = userBox.getMutableComponent(Position).value
      const userBox3dComponent = userBox.getMutableComponent(Object3DComponent).value
      userBoxPositionComponent.z = 40
      userBox3dComponent.position.copy(userBoxPositionComponent);
      (userBoxPositionComponent as any).uuid = v4();
      (userBoxPositionComponent as any).userId = user.id

      // Add the user's box entity to the realtime store
      await client.mutate({
        mutation: addEntityInstance,
        variables: {
          id: userBox.id,
          name: 'User Entity ' + authUser.id,
          userId: (userBox as any).userId
        }
      })

      entityMap.set(camera.id, camera)
      entityMap.set(userBox.id, userBox)

      // Add the user's box entity's Position component to the realtime store.
      // For this demo, it's the only component that any other user will care about, so it's the only networked
      // component.
      await client.mutate({
        mutation: addComponentInstance,
        variables: {
          id: (userBoxPositionComponent as any).uuid,
          data: JSON.stringify(userBoxPositionComponent),
          entityId: userBox.id,
          userId: (userBoxPositionComponent as any).userId
        }
      })

      componentMap.set((userBoxPositionComponent as any).uuid, userBoxPositionComponent)

      // Left/right/up/down arrows move the user box and the camera
      document.onkeydown = (e) => {
        const cameraPositionComponent = camera.getMutableComponent(Position).value
        const camera3dObjectComponent = camera.getMutableComponent(Object3DComponent).value
        const userBoxPositionComponent = userBox.getMutableComponent(Position).value
        const userBox3dObjectComponent = userBox.getMutableComponent(Object3DComponent).value
        switch (e.keyCode) {
          case 37:
            cameraPositionComponent.x -= 0.5
            userBoxPositionComponent.x -= 0.5
            camera3dObjectComponent.position.copy(cameraPositionComponent)
            userBox3dObjectComponent.position.copy(userBoxPositionComponent)
            break
          case 38:
            cameraPositionComponent.z -= 0.5
            userBoxPositionComponent.z -= 0.5
            camera3dObjectComponent.position.copy(cameraPositionComponent)
            userBox3dObjectComponent.position.copy(userBoxPositionComponent)
            break
          case 39:
            cameraPositionComponent.x += 0.5
            userBoxPositionComponent.x += 0.5
            camera3dObjectComponent.position.copy(cameraPositionComponent)
            userBox3dObjectComponent.position.copy(userBoxPositionComponent)
            break
          case 40:
            cameraPositionComponent.z += 0.5
            userBoxPositionComponent.z += 0.5
            camera3dObjectComponent.position.copy(cameraPositionComponent)
            userBox3dObjectComponent.position.copy(userBoxPositionComponent)
            break
        }
      }

      // Get entities, users, and components already in the realtime store, i.e. users and their box avatars
      // that are already in the room.
      const entityResult = await client.mutate({
        mutation: findEntityInstances
      })

      const userResult = await client.mutate({
        mutation: findUserInstances,
        variables: {
          query: JSON.stringify({
            id: {
              $not: user.id
            }
          })
        }
      })

      const existingEntities = entityResult.data.findEntityInstances

      const existingUsers = userResult.data.findUserInstances

      const componentResult = await client.mutate({
        mutation: findComponentInstances
      })

      const existingComponents = componentResult.data.findComponentInstances

      existingUsers.forEach((user: any) => {
        if (userMap.get(user.id) == null) {
          userMap.set(user.id, user)
        }
      })

      existingEntities.forEach(async (entity: any) => {
        // Create an entity here for all those that are already in the store but not present locally
        // We're assuming the only entities being saved in the realtime store are user 'avatar' boxes
        if (entityMap.get(entity.id) == null) {
          // Get the entity's child components
          const childComponents = existingComponents.filter((component) => {
            return component.entityId === entity.id
          })

          const mesh = new THREE.Mesh(geometry, material)
          const otherUserBox = world.createEntity()
            .addObject3DComponents(mesh, scene)
            .addComponent(Movable)

          otherUserBox.id = entity.id

          childComponents.forEach((component) => {
            // data is sent and stored as stringified JSON, so we need to parse it back into JSON
            component.data = JSON.parse(component.data)
            componentMap.set(component.id, component)
            const boxPositionComponent = otherUserBox.getMutableComponent(Position).value
            const box3dObjectComponent = otherUserBox.getMutableComponent(Object3DComponent).value
            boxPositionComponent.copy(component.data)
            // Non-standard fields on a component need to be set manually.
            boxPositionComponent.uuid = component.id
            boxPositionComponent.userId = component.userId
            box3dObjectComponent.position.copy(boxPositionComponent)
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
          if (existingComponent != null && updatedComponent.id !== userBox.getComponent(Position).uuid) {
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
              .addObject3DComponents(mesh, scene)
              .addComponent(Movable)

            otherUserBox.id = createdEntity.id

            entityMap.set(createdEntity.id, otherUserBox)
          }
        }
      })

      // Listen for users being created and add them to the local cache
      userInstanceCreatedSubscription.subscribe({
        next(data) {
          const createdUser = data.data.userInstanceCreated
          userMap.set(createdUser.id, createdUser)
        }
      })

      // Listen for users being removed and remove them from the local cache
      userInstanceRemovedSubscription.subscribe({
        next(data) {
          const removedUser = data.data.userInstanceRemoved
          userMap.delete(removedUser.id)
        }
      })

      // Listen for entities being removed and remove them from the local cache as well as removing them from the world.
      entityInstanceRemovedSubscription.subscribe({
        next(data) {
          const removedEntity = data.data.entityInstanceRemoved
          const entity = entityMap.get(removedEntity.id)
          world.removeEntity(entity)
          entityMap.delete(removedEntity.id)
        }
      })

      // Listen for entities being removed and remove them from the local cache
      componentInstanceRemovedSubscription.subscribe({
        next(data) {
          const removedComponent = data.data.componentInstanceRemoved
          componentMap.delete(removedComponent.id)
        }
      })

      // When the window is closing, tell the realtime store to remove all of the user's owned entities and components,
      // as well as tell it to remove the user
      window.onunload = async () => {
        entityMap.forEach((value, key) => {
          if (value.userId === user.id) {
            client.mutate({
              mutation: removeEntityInstance,
              variables: {
                id: key
              }
            })
          }
        })
        componentMap.forEach((value, key) => {
          if (value.userId === user.id) {
            client.mutate({
              mutation: removeComponentInstance,
              variables: {
                id: key
              }
            })
          }
        })
        client.mutate({
          mutation: removeUserInstance
        })
      }
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
