import React from 'react'
import CssBaseline from '@material-ui/core/CssBaseline'
import Typography from '@material-ui/core/Typography'
import ArrowBackIcon from '@material-ui/icons/ArrowBack'
import { makeStyles } from '@material-ui/core/styles'
import Container from '@material-ui/core/Container'
import Plans from './plans'
import { Tabs, Tab, Box, Button } from '@material-ui/core'
import { client } from '../../../redux/feathers'
import { useRouter } from 'next/router'

const useStyles = makeStyles((theme) => ({
  '@global': {
    ul: {
      margin: 0,
      padding: 0,
      listStyle: 'none'
    }
  },
  heroContent: {
    padding: theme.spacing(8, 0, 6)
  },
  tabs: {
    marginBottom: 20
  }
}))

interface TabPanelProps {
  children?: React.ReactNode;
  dir?: string;
  index: any;
  value: any;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`full-width-tabpanel-${index}`}
      {...other}
    >
      {value === index && (
        <Box>
          {children}
        </Box>
      )}
    </Box>
  )
}

const Pricing = () => {
  const classes = useStyles()
  const [value, setValue] = React.useState(0)
  const [monthly, setMonthly] = React.useState([])
  const [annual, setAnnual] = React.useState([])

  React.useEffect(() => {
    client.service('subscription-type').find()
      .then(response => {
        filterData(response.data)
      })
      .catch(err => console.log(err))
  }, [])

  const router = useRouter()
  const filterData = (planData) => {
    setMonthly(planData.filter(plan => plan.type === 'monthly').sort((planA, planB) => planA.amount - planB.amount))
    setAnnual(planData.filter(plan => plan.type === 'annual').sort((planA, planB) => planA.amount - planB.amount))
  }

  const handleChange = (event: React.ChangeEvent<{}>, newValue: number) => {
    setValue(newValue)
  }

  return (
    <React.Fragment>
      <CssBaseline />
      {/* Hero unit */}
      <Button variant="contained" color="primary" onClick={() => router.push('/')}>
        <ArrowBackIcon />
      </Button>
      <Container maxWidth="sm" component="main" className={classes.heroContent}>
        <Typography component="h1" variant="h2" align="center" color="textPrimary" gutterBottom>
          Pricing
        </Typography>
        <Typography variant="h5" align="center" color="textSecondary" component="p">
          Please select the plan that is best suited to your requirements.
        </Typography>
      </Container>
      <Tabs
        className={classes.tabs}
        value={value}
        onChange={handleChange}
        indicatorColor="primary"
        textColor="primary"
        centered
      >
        <Tab label="Monthly" />
        <Tab label="Annually" />
      </Tabs>
      {/* End hero unit */}
      <div>
        <TabPanel value={value} index={0}>
          <Plans tiers={monthly}/>
        </TabPanel>
        <TabPanel value={value} index={1}>
          <Plans tiers={annual} />
        </TabPanel>
      </div>
    </React.Fragment>
  )
}

export default Pricing
