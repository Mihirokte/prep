import { startApp } from './app'

void startApp({ devUrl: process.env.PREP_DEV_URL || undefined })
