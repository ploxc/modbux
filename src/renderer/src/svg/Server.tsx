import { StyledSvg, StyledSvgProps } from './util'

const Server = ({ sx }: StyledSvgProps): JSX.Element => {
  return (
    <StyledSvg sx={sx} version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
      <path d="M 148.14423,64.521353 21.497603,191.168 l 38.56728,41.69434 -32.31312,35.9614 208.568837,192.31523 z" />
      <path d="M 351.85582,64.521353 478.50243,191.168 l -38.56727,41.69434 32.31312,35.9614 -208.56882,192.31523 z" />
      <path d="M 164.96471,64.521353 180.14486,137.10612 335.03532,64.521353 318.91009,136.85578 Z" />
      <circle cx="250" cy="100.81373" r="19.712114" />
      <circle cx="250" cy="182.32358" r="13.679432" />
      <circle cx="250" cy="250" r="13.679432" />
      <circle cx="250.00003" cy="317.67639" r="13.679432" />
    </StyledSvg>
  )
}

export default Server
