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
import addEntityInstance from '../../apollo/mutations/entity-instance/add-entity-instance.gql'
import patchEntityInstance from '../../apollo/mutations/entity-instance/patch-entity-instance.gql'
import findComponentInstances from '../../apollo/mutations/component-instance/find-component-instances.gql'
import addComponentInstance from '../../apollo/mutations/component-instance/add-component-instance.gql'
import patchComponentInstance from '../../apollo/mutations/component-instance/patch-component-instance.gql'
import client from '../../utils/apollo-client'
import { v4 } from 'uuid'

// This React component is an example of how to create an ecsy-three entity with components, animate it, store the
// entity and components in the realtime store via GraphQL, and update some components as they change.
// The component 'listener-example' demonstrates getting values from a subscription and updating an entity/component
// using those values.

const entityMap = new Map()
const componentMap = new Map()

class Rotating extends Component {}

// According to the ECSY documentation, entities and components should be modified from systems.
//You could probably modify them elsewhere, but this seems to be the most accepted and scoped place.
class RotationSystem extends System {
    //execute runs every frame. delta is the amount of time since the last call to execute.
    execute(delta) {
        //queries.X.results gets everything that matches that result.
        //queries.X.changed gets only the entities that have changed.
        //There's also queries.X.added and queries.X.removed.
        this.queries.entities.results.forEach(entity => {
            //entity.getComponent will get a component in a read-only state. If you want to modify it, you must
            //use .getMutableComponent
            var rotation = entity.getMutableComponent(Transform).rotation
            rotation.x += 0.5 * delta
            rotation.y += 0.1 * delta
        })

        this.queries.entities.changed.forEach(entity => {
            let transformComponent = entity.getComponent(Transform)

            client.mutate({
                mutation: patchComponentInstance,
                variables: {
                    id: (transformComponent as any).uuid,
                    data: JSON.stringify(transformComponent)
                }
            })
        })
    }
}

//This is how you set which entities you want to attach a system to (you can also set it inside the system by
//using this.queries = {<blah>})

RotationSystem.queries = {
    //'entities' is the the name for a query; this can be whatever you like.
    entities: {
        //The system will only match entities that have all of the components listed in this array.
        components: [Rotating, Transform],
        //You can only enable listeners for some of 'added', 'removed', and 'changed'.
        //If the value is true for 'changed', then any component listed above in 'components' that's changed will
        //cause the entity show up on queries.X.changed.
        //If, like below, you give a list of components, then only those components changing will trigger this;
        //in this case, a change in 'Rotating' will not affect anything.
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
        auth: selectAuthState(state),
    }
}

const mapDispatchToProps = (dispatch: Dispatch) => ({
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

    var texture = new THREE.TextureLoader().load('../../textures/crate.gif')
    var geometry = new THREE.BoxBufferGeometry(20, 20, 20)
    var material = new THREE.MeshBasicMaterial({map: texture})
    mesh = new THREE.Mesh(geometry, material)

    // Create an entity to handle our rotating box
    //The argument passed to createEntity is its name.
    //We may want to overwrite the ID instead.
    var rotatingBox = world.createEntity(v4())
    //The object passed as the second argument overrides the default values.
    //    It appears that you can't set new values through this, e.g. you can't set 'uuid: v4()' if uuid is not
    //    a value associated with that component type. You'd have to set that manually afterwards.
        .addComponent(Object3D, {value: mesh})
        .addComponent(Transform)
        .addComponent(Parent, {value: scene})
        .addComponent(Rotating)

    const authUser = auth.get('authUser')

    if (authUser != null && authUser.accessToken && authUser.accessToken.length > 0) {
        try {
            const entityExists = await client.mutate({
                mutation: getEntityInstance,
                variables: {
                    id: rotatingBox.name
                }
            })

            if (entityExists.data.getEntityInstance == null) {
                //I believe we'll need to use Maps/Objects to keep track of everything by ID.
                entityMap.set(rotatingBox.name, rotatingBox)
                await client.mutate({
                    mutation: addEntityInstance,
                    variables: {
                        id: rotatingBox.name,
                        name: 'Rotating Box'
                    }
                })

                Object.keys(rotatingBox.getComponents()).forEach(async (componentName) => {
                    // entity.getComponent takes a component as its argument. If you want to get things by name,
                    //you have to do it like this
                    const component = rotatingBox.getComponents()[componentName]
                    //This seems to be how you need to set custom properties on a component; as mentioned above,
                    //it seems like trying to set additional properties when creating a component ignores any properties
                    //that aren't a default property on that component type.
                    component.uuid = v4()
                    componentMap.set(component.uuid, component)
                    //Parent and Object3D were giving me problems due to either being too large (~200Kb) for GraphQL
                    //by default or having circular references, which breaks JSON.stringify.
                    //We'll probably only want to save important information rather than the entirety of a component
                    //in many cases.
                    if (componentName !== 'Parent' && componentName !== 'Object3D') {
                        let componentAddResult = await client.mutate({
                            mutation: addComponentInstance,
                            variables: {
                                id: component.uuid,
                                data: JSON.stringify(component),
                                entityId: rotatingBox.name
                            }
                        })
                    }
                })
            }

            // Let's begin
            world.execute()

            //Some more examples of using GraphQL
            let getEntityInstanceResult = await client.mutate({
                mutation: getEntityInstance,
                variables: {
                    id: rotatingBox.name
                }
            })

            let findComponentInstancesResult = await client.mutate({
                mutation: findComponentInstances
            })

            console.log(findComponentInstancesResult.data.findComponentInstances)
            console.log(getEntityInstanceResult.data.getEntityInstance)
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
