import {useEffect} from 'react'
import { Component, System, World } from 'ecsy'
import { connect } from 'react-redux'
import {
    initialize,
    Parent,
    Camera,
    Transform,
    Object3D,
    WebGLRendererSystem
} from 'ecsy-three'
import * as THREE from 'three'
import {fetchAdminVideos} from '../../redux/admin/service'
import {selectAuthState} from '../../redux/auth/selector'
import {selectAdminState} from '../../redux/admin/selector'
import {selectVideoState} from '../../redux/video/selector'
import {bindActionCreators, Dispatch} from 'redux'
import {ApolloClient, ApolloLink, from, HttpLink, InMemoryCache, split} from '@apollo/client'
import { setContext } from 'apollo-link-context'
import { WebSocketLink} from '@apollo/link-ws'
import {getMainDefinition} from '@apollo/client/utilities'
import getEntityInstance from '../../apollo/mutations/entity-instance/get-entity-instance-by-id.gql'
import findEntityInstances from '../../apollo/mutations/entity-instance/find-entity-instances.gql'
import addEntityInstance from '../../apollo/mutations/entity-instance/add-entity-instance.gql'
import patchEntityInstance from '../../apollo/mutations/entity-instance/patch-entity-instance.gql'
import findComponentInstances from '../../apollo/mutations/component-instance/find-component-instances.gql'
import componentInstancePatched from '../../apollo/subscriptions/component-instance/component-instance-patched.gql'
import addComponentInstance from '../../apollo/mutations/component-instance/add-component-instance.gql'
import client from '../../utils/apollo-client'
import { v4 } from 'uuid'

// This React component is an example of how to get values from a GraphQL subscription and update an entity/component
// using those values.
// The component 'listener-example' demonstrates how to create an ecsy-three entity with components, animate it,
// store the entity and components in the realtime store via GraphQL, and update some components as they change.

const entityMap = new Map()
const componentMap = new Map()

class Rotating extends Component {}

class RotationSystem extends System {
    execute(delta) {
        this.queries.entities.results.forEach(entity => {
            //This is getting the Transform component in a writable form, then looking up the values for that component
            //that are stored in the component Map and overwriting the rotation.
            //The subscription invoked later in this file is what's updating the values in the Map.
            const transformComponent = entity.getMutableComponent(Transform)
            const mappedComponent = componentMap.get(transformComponent.uuid)
            if (mappedComponent) {
                transformComponent.rotation = mappedComponent.rotation
            }
        })
    }
}

RotationSystem.queries = {
    entities: {
        components: [Transform]
    }
}

interface Props {
    auth: any
}

const mapStateToProps = (state: any) => {
    return {
        auth: selectAuthState(state),
    }
}

const mapDispatchToProps = (dispatch: Dispatch) => ({})

//Sets up a subscription on componentInstancePatched.
//The handler for the subscription is farther down.
const componentInstancePatchedSubscription = client.subscribe({
    query: componentInstancePatched
})

async function init(auth: any) {
    var world, mesh
    // Create a new world to hold all our entities and systems
    world = new World()

    // Initialize the default sets of entities and systems
    let data = initialize(world)
    world.registerSystem(RotationSystem)

    // Grab the initialized entities
    let {scene, renderer, camera} = data.entities

    // Modify the position for the default camera
    let transform = camera.getMutableComponent(Transform)
    transform.position.z = 40

    //We're defining three.js component values here but not using them on a component yet.
    var texture = new THREE.TextureLoader().load('../../textures/crate.gif')
    var geometry = new THREE.BoxBufferGeometry(20, 20, 20)
    var material = new THREE.MeshBasicMaterial({map: texture})
    mesh = new THREE.Mesh(geometry, material)

    const authUser = auth.get('authUser')

    if (authUser != null && authUser.accessToken && authUser.accessToken.length > 0) {
        try {
            //Getting entities that are in the realtime store on an instance server.
            //We'll assuredly want to filter these down in a real situation.
            const entityResult = await client.mutate({
                mutation: findEntityInstances
            })

            const existingEntities = entityResult.data.findEntityInstances

            const componentResult = await client.mutate({
                mutation: findComponentInstances
            })

            const existingComponents = componentResult.data.findComponentInstances
            existingEntities.forEach(async (entity: any) => {
                //Create an entity here for all those that are not present
                if (entityMap.get(entity.id) == null) {
                    //Get the entity's child components
                    const childComponents = existingComponents.filter((component) => {
                        return component.entityId === entity.id
                    })

                    //This is very similar to the other page, but we're not adding Rotation or Transform
                    //Rotation was left off to show that the rotation of the cube was solely from the values we get
                    //from the GraphQL subscription.
                    //Transform is added a bit later with overriding values
                    var rotatingBox = world.createEntity(entity.id)
                        .addComponent(Object3D, {value: mesh})
                        .addComponent(Parent, {value: scene})

                    childComponents.forEach((component) => {
                        //data is sent and stored as stringified JSON, so we need to parse it back into JSON
                        component.data = JSON.parse(component.data)
                        //Just a hacky way to ignore the Rotation component that's being saved/retrieved
                        if (component.data.rotation) {
                            componentMap.set(component.id, component.data)
                            rotatingBox.addComponent(Transform, componentMap.get(component.id))
                            rotatingBox.getComponent(Transform).uuid = component.data.uuid
                        }
                    })

                    entityMap.set(entity.id, rotatingBox)
                }
            })

            // Let's begin
            world.execute()

            //This is how you actually handle subscriptions and the data that's pushed over them.
            componentInstancePatchedSubscription.subscribe({
                next(data) {
                    //Here we're parsing JSON if it's in stringified form and then updating the component's values
                    //in the Map. The RotationSystem up above does the actual updating of the Component from the values
                    //in the Map.
                    const updatedComponent = data.data.componentInstancePatched
                    if (typeof updatedComponent.data === 'string') {
                        updatedComponent.data = JSON.parse(updatedComponent.data)
                    }
                    const existingComponent = componentMap.get(updatedComponent.id)
                    if (existingComponent != null) {
                        componentMap.set(updatedComponent.id, updatedComponent.data)
                    }
                }
            })
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

    return (<div></div>)
}


const EcsyComponentWrapper = (props: any) => {
    return <EcsyComponent {...props} />
}

export default connect(mapStateToProps, mapDispatchToProps)(EcsyComponentWrapper)
