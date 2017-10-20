// @flow

import * as redux from 'redux'
import reducer from './reducer'

import type {Store, Dispatch} from 'redux'
import type {InitialState} from 'state/reducer'
import type {Action} from 'state/actions'

const store: Store<InitialState, Action, Dispatch<Action>> = redux.createStore(reducer)

export default store
