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
import { v4 } from 'uuid'

import getConfig from 'next/config'

const { publicRuntimeConfig } = getConfig()
const featherStoreKey: string = publicRuntimeConfig.featherStoreKey


class Rotating extends Component {}

class RotationSystem extends System {
    execute(delta) {
        this.queries.entities.results.forEach(entity => {
            var rotation = entity.getMutableComponent(Transform).rotation
            rotation.x += 0.5 * delta
            rotation.y += 0.1 * delta
        })

        this.queries.entities.changed.forEach(entity => {
            client.mutate({
                mutation: patchEntityInstance,
                variables: {
                    id: (entity as any).name,
                    name: v4()
                }
            })
        })
    }
}

RotationSystem.queries = {
    entities: {
        components: [Rotating, Transform],
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

const httpLink = new HttpLink({
    uri: 'http://localhost:3030/graphql'
})

const wsLink = new WebSocketLink({
    uri: 'ws://localhost:3030/subscriptions',
    options: {
        reconnect: true
    }
})

const link = split(
    ({ query }) => {
        const definition = getMainDefinition(query)
        return (
            definition.kind === 'OperationDefinition' && definition.operation === 'subscription'
        )
    },
    wsLink,
    httpLink
)
const authLink = setContext((operation, {headers, ...context}) => {
    const key = localStorage.getItem(featherStoreKey)

    return {
        headers: {
            ...headers,
            authorization: key ? `Bearer ${key}` : '',
        }
    }
})

const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: from(
        [
            authLink as unknown as ApolloLink,
            link
        ]
    )
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

    var texture = new THREE.TextureLoader().load('textures/crate.gif')
    var geometry = new THREE.BoxBufferGeometry(20, 20, 20)
    var material = new THREE.MeshBasicMaterial({map: texture})
    mesh = new THREE.Mesh(geometry, material)

    // Create an entity to handle our rotating box
    var rotatingBox = world.createEntity(v4())
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
                    id: rotatingBox.name,
                    jwt: authUser.accessToken
                }
            })

            if (entityExists.data.getEntityInstance == null) {
                await client.mutate({
                    mutation: addEntityInstance,
                    variables: {
                        id: rotatingBox.name,
                        name: 'Rotating Box'
                    }
                })

                Object.keys(rotatingBox.getComponents()).forEach(async (componentName) => {
                    const component = rotatingBox.getComponents()[componentName]
                    component.uuid = v4()
                    if (componentName !== 'Parent' && componentName !== 'Object3D') {
                        let componentAddResult = await client.mutate({
                            mutation: addComponentInstance,
                            variables: {
                                id: component.uuid,
                                data: JSON.stringify(component)
                            }
                        })
                    }
                })
            }

            // Let's begin
            world.execute()

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
