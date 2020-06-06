import Layout from '../../../components/ui/Layout'
import dynamic from "next/dynamic";
const EcsyListenerExample = dynamic(() => import('../../../components/ecsy/listener-example'), {
    ssr: false
})

const EcsyPage = () => {
  return (
      <Layout pageTitle="Home">
          <EcsyListenerExample/>
      </Layout>
  )
}

export default EcsyPage
