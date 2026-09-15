import { test, expect } from '../../fixtures/electron-app'
import { addRegister, cleanServerState } from '../../fixtures/helpers'

// A toggle writes the whole word back, so it has to read the word the toggle
// before it wrote. The store gets that word one IPC round trip late and hands
// it on after 50 ms of quiet, and clicks arrive faster than either.
test.describe.serial('Server bit toggles in quick succession', () => {
  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('add a bitmap register at 0 and open its bit panel', async ({ mainPage }) => {
    await addRegister(mainPage, {
      registerType: 'holding_registers',
      dataType: 'BITMAP',
      address: 0,
      mode: 'fixed',
      value: '0'
    })
    await mainPage.getByTestId('server-bitmap-expand-0').click()
    await expect(mainPage.getByTestId('server-bit-circle-0')).toBeVisible()
  })

  test('two bits back to back are both set', async ({ mainPage }) => {
    await mainPage.getByTestId('server-bit-circle-0').click()
    await mainPage.getByTestId('server-bit-circle-1').click()

    await expect(mainPage.getByTestId('server-reg-value-holding_registers-0')).toHaveText('3')
  })

  test('two bits back to back are both cleared', async ({ mainPage }) => {
    await mainPage.getByTestId('server-bit-circle-0').click()
    await mainPage.getByTestId('server-bit-circle-1').click()

    await expect(mainPage.getByTestId('server-reg-value-holding_registers-0')).toHaveText('0')
  })

  test('a double click on one bit leaves it where it was', async ({ mainPage }) => {
    await mainPage.getByTestId('server-bit-circle-0').dblclick()

    await expect(mainPage.getByTestId('server-reg-value-holding_registers-0')).toHaveText('0')
    await expect(mainPage.getByTestId('server-bit-circle-0')).toHaveAttribute(
      'data-active',
      'false'
    )
  })

  test('a single toggle still sets its bit', async ({ mainPage }) => {
    await mainPage.getByTestId('server-bit-circle-3').click()

    await expect(mainPage.getByTestId('server-reg-value-holding_registers-0')).toHaveText('8')
  })

  test('clean up', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })
})
